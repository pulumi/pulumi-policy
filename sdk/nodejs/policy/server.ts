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
const structproto = require("google-protobuf/google/protobuf/struct_pb.js");
const plugproto = require("@pulumi/pulumi/proto/plugin_pb.js");

import { AssertionError } from "assert";

import { deserializeProperties } from "./deserialize";
import {
    Policies,
    Policy,
    ReportViolation,
    ResourceValidationArgs,
    ResourceValidationPolicy,
} from "./policy";
import {
    asGrpcError,
    Diagnostic,
    makeAnalyzeResponse,
    makeAnalyzerInfo,
    mapEnforcementLevel,
} from "./protoutil";
import { unknownCheckingProxy, UnknownValueError } from "./proxy";
import { version } from "./version";

// ------------------------------------------------------------------------------------------------

// Analyzer RPC implementation. Receives requests from the engine to validate (or `analyze`)
// resources, and validates them against a set of policies provided by the user. Failures are
// returned with metadata about the policy that was violated.

// ------------------------------------------------------------------------------------------------

let serving = false;

export function serve(policyPackName: string, policyPackVersion: string, policies: Policies): void {
    if (serving !== false) {
        throw Error("Only one policy gRPC server can run per process");
    }

    serving = true;

    // Finally connect up the gRPC client/server and listen for incoming requests.
    const server = new grpc.Server();
    server.addService(analyzerrpc.AnalyzerService, {
        analyze: makeAnalyzeRpcFun(policyPackName, policyPackVersion, policies),
        getAnalyzerInfo: makeGetAnalyzerInfoRpcFun(policyPackName, policyPackVersion, policies),
        getPluginInfo: getPluginInfoRpc,
    });
    const port: number = server.bind(`0.0.0.0:0`, grpc.ServerCredentials.createInsecure());

    server.start();

    // Emit the address so the monitor can read it to connect.  The gRPC server will keep the
    // message loop alive.
    console.log(port);
}

// analyze is the RPC call that will analyze an individual resource, one at a time (i.e., check).
function makeGetAnalyzerInfoRpcFun(
    policyPackName: string,
    policyPackVersion: string,
    policies: Policies,
) {
    return async function(call: any, callback: any): Promise<void> {
        try {
            callback(undefined, makeAnalyzerInfo(policyPackName, policies));
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

// analyze is the RPC call that will analyze an individual resource, one at a time (i.e., check).
function makeAnalyzeRpcFun(policyPackName: string, policyPackVersion: string, policies: Policies) {
    return async function(call: any, callback: any): Promise<void> {
        // Prep to perform the analysis.
        const req = call.request;

        // Run the analysis for every analyzer in the global list, tracking any diagnostics.
        const ds: Diagnostic[] = [];
        try {
            for (const p of policies) {
                if (!isResourcePolicy(p)) {
                    continue;
                }

                const reportViolation: ReportViolation = (message, urn) => {
                    const { validateResource, name, ...diag } = p;

                    ds.push({
                        policyName: name,
                        policyPackName,
                        policyPackVersion,
                        message: message,
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
