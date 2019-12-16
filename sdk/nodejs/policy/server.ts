// Copyright 2016-2019, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const grpc = require("grpc");
const analyzerrpc = require("@pulumi/pulumi/proto/analyzer_grpc_pb.js");
const plugproto = require("@pulumi/pulumi/proto/plugin_pb.js");

import { deserializeProperties } from "./deserialize";
import {
    Policies,
    Policy,
    PolicyCustomTimeouts,
    PolicyResource,
    PolicyResourceOptions,
    ReportViolation,
    ResourceValidationArgs,
    ResourceValidationPolicy,
    StackValidationArgs,
    StackValidationPolicy,
} from "./policy";
import {
    asGrpcError,
    Diagnostic,
    makeAnalyzeResponse,
    makeAnalyzerInfo,
} from "./protoutil";
import { unknownCheckingProxy, UnknownValueError } from "./proxy";
import { version } from "./version";

import * as process from "process";

// ------------------------------------------------------------------------------------------------

// Analyzer RPC implementation. Receives requests from the engine to validate (or `analyze`)
// resources, and validates them against a set of policies provided by the user. Failures are
// returned with metadata about the policy that was violated.

// ------------------------------------------------------------------------------------------------

// Name of the policy pack currently being served, if applicable.
let servingPolicyPack: string | undefined = undefined;

// Regular expression for the policy pack name.
const packNameRE = "^[a-zA-Z0-9-_.]{1,100}$";

/**
  * Starts the gRPC server to communicate with the Pulumi CLI client for analyzing resources.
  *
  * Only one gRPC server can be running at a time, and the port the server is running on will
  * be written to STDOUT.
  *
  * @param policyPackName Friendly name of the policy pack.
  * @param policyPackVersion Version of the policy pack SDK used.
  * @param policies The policies to be served.
  * @internal
  */
export function serve(policyPackName: string, policyPackVersion: string, policies: Policies): void {
    if (!policyPackName || !policyPackName.match(packNameRE)) {
        console.error(`Invalids policy pack name "${policyPackName}". Policy pack names may only contain alphanumerics, hyphens, underscores, or periods.`);
        process.exit(1);
    }

    if (servingPolicyPack) {
        // We only support running one gRPC instance at a time. (Since the Pulumi CLI is looking for a single
        // PID to be written to STDOUT.) So we just print an error and kill the process if a second policy pack
        // is about to be served.
        console.error(`Already serving policy pack '${servingPolicyPack}'. Only one policy pack may be defined per-process.`);
        process.exit(1);
    }
    servingPolicyPack = policyPackName;

    // Finally connect up the gRPC client/server and listen for incoming requests.
    const server = new grpc.Server();
    server.addService(analyzerrpc.AnalyzerService, {
        analyze: makeAnalyzeRpcFun(policyPackName, policyPackVersion, policies),
        analyzeStack: makeAnalyzeStackRpcFun(policyPackName, policyPackVersion, policies),
        getAnalyzerInfo: makeGetAnalyzerInfoRpcFun(policyPackName, policyPackVersion, policies),
        getPluginInfo: getPluginInfoRpc,
    });
    const port: number = server.bind(`0.0.0.0:0`, grpc.ServerCredentials.createInsecure());

    server.start();

    // Emit the address so the monitor can read it to connect.  The gRPC server will keep the
    // message loop alive.
    console.log(port);
}

function makeGetAnalyzerInfoRpcFun(
    policyPackName: string,
    policyPackVersion: string,
    policies: Policies,
) {
    return async function(call: any, callback: any): Promise<void> {
        try {
            const enabledPolicies = (policies || []).filter(p => p.enforcementLevel !== "disabled");
            callback(undefined, makeAnalyzerInfo(policyPackName, enabledPolicies));
        } catch (e) {
            callback(asGrpcError(e), undefined);
        }
    };
}

async function getPluginInfoRpc(call: any, callback: any): Promise<void> {
    try {
        const resp: any = new plugproto.PluginInfo();
        resp.setVersion(version);
        callback(undefined, resp);
    } catch (e) {
        callback(asGrpcError(e), undefined);
    }
}

// analyze is the RPC call that will analyze an individual resource, one at a time, called with the
// "inputs" to the resource, before it is updated.
function makeAnalyzeRpcFun(policyPackName: string, policyPackVersion: string, policies: Policies) {
    return async function(call: any, callback: any): Promise<void> {
        // Prep to perform the analysis.
        const req = call.request;

        // Run the analysis for every analyzer in the global list, tracking any diagnostics.
        const ds: Diagnostic[] = [];
        try {
            for (const p of policies) {
                if (p.enforcementLevel === "disabled" || !isResourcePolicy(p)) {
                    continue;
                }

                const reportViolation: ReportViolation = (message, urn) => {
                    const { validateResource, name, ...diag } = p;

                    let violationMessage = diag.description;
                    if (message) {
                        violationMessage += `\n${message}`;
                    }

                    ds.push({
                        policyName: name,
                        policyPackName,
                        policyPackVersion,
                        message: violationMessage,
                        urn: urn,
                        ...diag,
                    });
                };

                const validations = Array.isArray(p.validateResource)
                    ? p.validateResource
                    : [p.validateResource];

                for (const validation of validations) {
                    try {
                        const deserd = deserializeProperties(req.getProperties());
                        const args: ResourceValidationArgs = {
                            type: req.getType(),
                            props: unknownCheckingProxy(deserd),
                            urn: req.getUrn(),
                            name: req.getName(),
                            opts: getResourceOptions(req),
                        };

                        // Pass the result of the validate call to Promise.resolve.
                        // If the value is a promise, that promise is returned; otherwise
                        // the returned promise will be fulfilled with the value.
                        await Promise.resolve(validation(args, reportViolation));
                    } catch (e) {
                        if (e instanceof UnknownValueError) {
                            const { validateResource, name, ...diag } = p;

                            ds.push({
                                policyName: name,
                                policyPackName,
                                policyPackVersion,
                                message: `can't run policy '${name}' during preview: ${e.message}`,
                                ...diag,
                                enforcementLevel: "advisory",
                            });
                        } else {
                            throw asGrpcError(e, `Error validating resource with policy ${p.name}`);
                        }
                    }
                }
            }
        } catch (err) {
            callback(err, undefined);
            return;
        }

        // Now marshal the results into a resulting diagnostics list, and invoke the callback to finish.
        callback(undefined, makeAnalyzeResponse(ds));
    };
}

// analyzeStack is the RPC call that will analyze all resources within a stack, at the end of a successful
// preview or update. The provided resources are the "outputs", after any mutations have taken place.
function makeAnalyzeStackRpcFun(policyPackName: string, policyPackVersion: string, policies: Policies) {
    return async function(call: any, callback: any): Promise<void> {
        // Prep to perform the analysis.
        const req = call.request;

        // Run the analysis for every analyzer in the global list, tracking any diagnostics.
        const ds: Diagnostic[] = [];
        try {
            for (const p of policies) {
                if (p.enforcementLevel === "disabled" || !isStackPolicy(p)) {
                    continue;
                }

                const reportViolation: ReportViolation = (message, urn) => {
                    const { validateStack, name, ...diag } = p;

                    let violationMessage = diag.description;
                    if (message) {
                        violationMessage += `\n${message}`;
                    }

                    ds.push({
                        policyName: name,
                        policyPackName,
                        policyPackVersion,
                        message: violationMessage,
                        urn: urn,
                        ...diag,
                    });
                };

                try {
                    const resources: PolicyResource[] = [];
                    for (const r of req.getResourcesList()) {
                        resources.push({
                            type: r.getType(),
                            props: r.getProperties().toJavaScript(),
                            urn: r.getUrn(),
                            name: r.getName(),
                            opts: getResourceOptions(r),
                        });
                    }

                    const args: StackValidationArgs = {
                        resources: resources,
                    };

                    // Pass the result of the validate call to Promise.resolve.
                    // If the value is a promise, that promise is returned; otherwise
                    // the returned promise will be fulfilled with the value.
                    await Promise.resolve(p.validateStack(args, reportViolation));
                } catch (e) {
                    if (e instanceof UnknownValueError) {
                        const { validateStack, name, ...diag } = p;

                        ds.push({
                            policyName: name,
                            policyPackName,
                            policyPackVersion,
                            message: `can't run policy '${name}' during preview: ${e.message}`,
                            ...diag,
                            enforcementLevel: "advisory",
                        });
                    } else {
                        throw asGrpcError(e, `Error validating stack with policy ${p.name}`);
                    }
                }
            }
        } catch (err) {
            callback(err, undefined);
            return;
        }

        // Now marshal the results into a resulting diagnostics list, and invoke the callback to finish.
        callback(undefined, makeAnalyzeResponse(ds));
    };
}

// Creates a PolicyResourceOptions object from the GRPC request.
function getResourceOptions(r: any): PolicyResourceOptions {
    const opts = r.getOptions();
    // If the result of `getOptions` is undefined, an older version of the CLI is being used.
    // Provide a nicer error message to the user.
    if (!opts) {
        throw new Error("A more recent version of the Pulumi CLI is required. " +
            "To upgrade, see https://www.pulumi.com/docs/get-started/install/");
    }
    const result: PolicyResourceOptions = {
        protect: opts.getProtect(),
        dependencies: opts.getDependenciesList().sort(),
        provider: opts.getProvider(),
        aliases: opts.getAliasesList().sort(),
        additionalSecretOutputs: opts.getAdditionalsecretoutputsList().sort(),
    };
    const parent = opts.getParent();
    const customTimeouts = getCustomTimeouts(opts);
    // Add only truthy members.
    if (parent) { result.parent = parent; }
    if (customTimeouts) { result.customTimeouts = customTimeouts; }
    return result;
}

// Creates a CustomTimeouts object from the GRPC request.
function getCustomTimeouts(opts: any): PolicyCustomTimeouts | undefined {
    const timeouts = opts.getCustomtimeouts();
    if (timeouts) {
        const createVal = timeouts.getCreate();
        const updateVal = timeouts.getUpdate();
        const deleteVal = timeouts.getDelete();
        if (createVal || updateVal || deleteVal) {
            const result: PolicyCustomTimeouts = {};
            // Add only truthy members.
            if (createVal) { result.create = createVal; }
            if (updateVal) { result.update = updateVal; }
            if (deleteVal) { result.delete = deleteVal; }
            return result;
        }
    }
    return undefined;
}

// Type guard used to determine if the `Policy` is a `ResourceValidationPolicy`.
function isResourcePolicy(p: Policy): p is ResourceValidationPolicy {
    const validation = (p as ResourceValidationPolicy).validateResource;
    if (typeof validation === "function") {
        return true;
    }
    if (Array.isArray(validation)) {
        for (const v of validation) {
            if (typeof v !== "function") {
                return false;
            }
        }
        return true;
    }
    return false;
}

// Type guard used to determine if the `Policy` is a `StackValidationPolicy`.
function isStackPolicy(p: Policy): p is StackValidationPolicy {
    return typeof (p as StackValidationPolicy).validateStack === "function";
}
