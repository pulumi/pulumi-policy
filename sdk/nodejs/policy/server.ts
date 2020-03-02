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

import { Resource, Unwrap } from "@pulumi/pulumi";
import * as q from "@pulumi/pulumi/queryable";

import { deserializeProperties } from "./deserialize";
import {
    Policies,
    Policy,
    PolicyCustomTimeouts,
    PolicyProviderResource,
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
        console.error(`Invalid policy pack name "${policyPackName}". Policy pack names may only contain alphanumerics, hyphens, underscores, or periods.`);
        process.exit(1);
    }

    for (const policy of (policies || [])) {
        if (policy.name === "all") {
            console.error(`Invalid policy name "all". "all" is a reserved name.`);
            process.exit(1);
        }
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
    return async function (call: any, callback: any): Promise<void> {
        try {
            const enabledPolicies = (policies || []).filter(p => p.enforcementLevel !== "disabled");
            callback(undefined, makeAnalyzerInfo(policyPackName, policyPackVersion, enabledPolicies));
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
    return async function (call: any, callback: any): Promise<void> {
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
                    const diagnosticEvent: Diagnostic = {
                        policyName: name,
                        policyPackName,
                        policyPackVersion,
                        message: violationMessage,
                        urn,
                        ...diag,
                    };

                    ds.push(diagnosticEvent);
                };

                const validations = Array.isArray(p.validateResource)
                    ? p.validateResource
                    : [p.validateResource];

                for (const validation of validations) {
                    try {
                        const type = req.getType();
                        const deserd = deserializeProperties(req.getProperties());
                        const props = unknownCheckingProxy(deserd);
                        const args: ResourceValidationArgs = {
                            type,
                            props,
                            urn: req.getUrn(),
                            name: req.getName(),
                            opts: getResourceOptions(req),

                            isType: function <TResource extends Resource>(
                                resourceClass: { new(...rest: any[]): TResource },
                            ): boolean {
                                return isTypeOf(type, resourceClass);
                            },

                            asType: function <TResource extends Resource, TArgs>(
                                resourceClass: { new(name: string, args: TArgs, ...rest: any[]): TResource },
                            ): Unwrap<NonNullable<TArgs>> | undefined {
                                return isTypeOf(type, resourceClass)
                                    ? props as Unwrap<NonNullable<TArgs>>
                                    : undefined;
                            },
                        };
                        const provider = getProviderResource(req);
                        if (provider) {
                            args.provider = provider;
                        }

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

/**
 * Used internally to create an initial resource instance that will be modified to include its
 * parent and dependencies before being passed to the policy validation handler.
 */
interface IntermediateStackResource {
    /** The resource object that will be passed to the policy for analysis. */
    resource: PolicyResource;
    /** The resource's parent URN (if it has one). */
    parent?: string;
    /** The resource's dependencies as URNs. */
    dependencies: string[];
    /** The set of dependencies (URNs) that affect each property. */
    propertyDependencies: Record<string, string[]>;
}

// analyzeStack is the RPC call that will analyze all resources within a stack, at the end of a successful
// preview or update. The provided resources are the "outputs", after any mutations have taken place.
function makeAnalyzeStackRpcFun(policyPackName: string, policyPackVersion: string, policies: Policies) {
    return async function (call: any, callback: any): Promise<void> {
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
                        urn,
                        ...diag,
                    });
                };

                try {
                    const intermediates: IntermediateStackResource[] = [];
                    for (const r of req.getResourcesList()) {
                        const type = r.getType();
                        const deserd = deserializeProperties(r.getProperties());
                        const props = unknownCheckingProxy(deserd);
                        const resource: PolicyResource = {
                            type,
                            props,
                            urn: r.getUrn(),
                            name: r.getName(),
                            opts: getResourceOptions(r),

                            // We will go back and fill in the dependencies and optional parent.
                            dependencies: [],
                            propertyDependencies: {},

                            isType: function <TResource extends Resource>(
                                resourceClass: { new(...rest: any[]): TResource },
                            ): boolean {
                                return isTypeOf(type, resourceClass);
                            },

                            asType: function <TResource extends Resource>(
                                resourceClass: { new(...rest: any[]): TResource },
                            ): q.ResolvedResource<TResource> | undefined {
                                return isTypeOf(type, resourceClass)
                                    ? props as q.ResolvedResource<TResource>
                                    : undefined;
                            },
                        };
                        const provider = getProviderResource(r);
                        if (provider) {
                            resource.provider = provider;
                        }
                        intermediates.push({
                            resource,
                            parent: r.getParent(),
                            dependencies: r.getDependenciesList(),
                            propertyDependencies: getPropertyDependencies(r),
                        });
                    }

                    // Create a map of URNs to resources, used to fill in the parent and dependencies
                    // with references to the actual resource objects.
                    const urnsToResources = new Map<string, PolicyResource>();
                    for (const i of intermediates) {
                        urnsToResources.set(i.resource.urn, i.resource);
                    }

                    // Go through each intermediate result and set the parent and dependencies.
                    for (const i of intermediates) {
                        // If the resource has a parent, lookup and set it to the actual resource object.
                        if (i.parent) {
                            const parent = urnsToResources.get(i.parent);
                            if (parent) {
                                i.resource.parent = parent;
                            }
                        }

                        // Set dependencies to actual resource objects.
                        i.resource.dependencies = i.dependencies
                            .map(d => urnsToResources.get(d))
                            .filter(d => d) as PolicyResource[];

                        // Set propertyDependencies to actual resource objects.
                        for (const k of Object.keys(i.propertyDependencies)) {
                            const v = i.propertyDependencies[k];
                            i.resource.propertyDependencies[k] = v
                                .map(d => urnsToResources.get(d))
                                .filter(d => d) as PolicyResource[];
                        }
                    }

                    const args: StackValidationArgs = {
                        resources: intermediates.map(r => r.resource),
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
        ignoreChanges: opts.getIgnorechangesList(),
        aliases: opts.getAliasesList(),
        customTimeouts: getCustomTimeouts(opts),
        additionalSecretOutputs: opts.getAdditionalsecretoutputsList(),
    };
    if (opts.getDeletebeforereplacedefined()) {
        result.deleteBeforeReplace = opts.getDeletebeforereplace();
    }
    return result;
}

// Creates a CustomTimeouts object from the GRPC request.
function getCustomTimeouts(opts: any): PolicyCustomTimeouts {
    const timeouts = opts.getCustomtimeouts();
    return {
        createSeconds: timeouts?.getCreate() ?? 0.0,
        updateSeconds: timeouts?.getUpdate() ?? 0.0,
        deleteSeconds: timeouts?.getDelete() ?? 0.0,
    };
}

// Creates a PolicyProviderResource object from the GRPC request.
function getProviderResource(r: any): PolicyProviderResource | undefined {
    const prov = r.getProvider();
    if (!prov) {
        return undefined;
    }
    const deserd = deserializeProperties(prov.getProperties());
    const props = unknownCheckingProxy(deserd);
    return {
        type: prov.getType(),
        props,
        urn: prov.getUrn(),
        name: prov.getName(),
    };
}

// Creates a Record<string, string[]> from the GRPC request.
function getPropertyDependencies(r: any): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    const map = r.getPropertydependenciesMap();
    if (map) {
        for (const [k, v] of map.entries()) {
            const urns = v.getUrnsList();
            result[k] = urns;
        }
    }
    return result;
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

// Helper to check if `type` is the type of `resourceClass`.
function isTypeOf<TResource extends Resource>(
    type: string,
    resourceClass: { new(...rest: any[]): TResource },
): boolean {
    const isInstance = (<any>resourceClass).isInstance;
    return isInstance &&
        typeof isInstance === "function" &&
        isInstance({ __pulumiType: type }) === true;
}
