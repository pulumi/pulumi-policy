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

import { AssertionError } from "assert";

import { deserializeProperties } from "./deserialize";
import { Policy } from "./policy";

import {
    asGrpcError,
    Diagnostic,
    makeAnalyzeResponse,
    makeAnalyzerInfo,
} from "./protoutil";

import { unknownCheckingProxy, UnknownValueError } from "./proxy";
import { version } from "./version";

// ------------------------------------------------------------------------------------------------

// Analyzer RPC implementation. Receives requests from the engine to validate (or `analyze`)
// resources, and validates them against a set of policies provided by the user. Failures are
// returned with metadata about the policy that was violated.

// ------------------------------------------------------------------------------------------------

// Flag indicating whether or not a gRPC service is currently running for this process.
let serving = false;

/**
 * Starts the gRPC server to communication with the Pulumi CLI client for analyzing resources.
 *
 * Only one gRPC server can be running at a time, and the port the server is running on will
 * be written to STDOUT.
 *
 * @param policyPackName Friendly name of the policy pack.
 * @param policyPackVersion Version of the policy pack SDK used.
 * @param policies The policies to be served.
 */
export function serve(policyPackName: string, policyPackVersion: string, policies: Policy[]): void {
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
    policies: Policy[],
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
function makeAnalyzeRpcFun(policyPackName: string, policyPackVersion: string, policies: Policy[]) {
    return async function(call: any, callback: any): Promise<void> {
        // Prep to perform the analysis.
        const req = call.request;

        // Run the analysis for every analyzer in the global list, tracking any diagnostics.
        const ds: Diagnostic[] = [];
        try {
            for (const p of policies) {
                let policyRules = [];
                if (Array.isArray(p.rules)) {
                    policyRules = p.rules;
                } else {
                    policyRules = [p.rules];
                }

                for (const rule of policyRules) {
                    try {
                        const deserd = deserializeProperties(req.getProperties());
                        rule(req.getType(), unknownCheckingProxy(deserd));
                    } catch (e) {
                        if (e instanceof UnknownValueError) {
                            // `Diagnostic` is just an `AdmissionPolicy` without a `rule` field.
                            const { rules, name, ...diag } = p;

                            ds.push({
                                policyName: name,
                                policyPackName,
                                policyPackVersion,
                                message: `can't run policy '${name}' during preview: ${e.message}`,
                                ...diag,
                                enforcementLevel: "advisory",
                            });
                        } else if (e instanceof AssertionError) {
                            // `Diagnostic` is just an `AdmissionPolicy` without a `rule` field.
                            const { rules, name, ...diag } = p;

                            const [expect, op, actual] = [e.expected, e.operator, e.actual];
                            const expectation = `observed value '${expect}' was expected to ${op} '${actual}'`;
                            const message = e.generatedMessage
                                ? `[${name}] ${diag.description}\n${expectation}`
                                : `[${name}] ${diag.description}\n${e.message}`;

                            ds.push({
                                policyName: name,
                                policyPackName,
                                policyPackVersion,
                                message: message,
                                ...diag,
                            });
                        } else {
                            throw asGrpcError(e, `Error validating resource with policy '${p.name}'`);
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
