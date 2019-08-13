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
const analyzerproto = require("@pulumi/pulumi/proto/analyzer_pb.js");
const analyzerrpc = require("@pulumi/pulumi/proto/analyzer_grpc_pb.js");
const structproto = require("google-protobuf/google/protobuf/struct_pb.js");
const plugproto = require("@pulumi/pulumi/proto/plugin_pb.js");

import { AssertionError } from "assert";

import { EnforcementLevel, Policy, Tag } from "./policy";
import { version } from "./version";

// ------------------------------------------------------------------------------------------------

// Analyzer RPC implementation. Receives requests from the engine to validate (or `analyze`)
// resources, and validates them against a set of policies provided by the user. Failures are
// returned with metadata about the policy that was violated.

// ------------------------------------------------------------------------------------------------

let serving = false;

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
        const resp: any = new analyzerproto.AnalyzerInfo();
        resp.setName(policyPackName);
        // TODO: resp.setDisplayname(policyPackName);

        const policyInfos: any[] = [];
        for (const policy of policies) {
            const policyInfo = new analyzerproto.PolicyInfo();
            policyInfo.setName(policy.name);
            // TODO: policyInfo.setDisplayname
            policyInfo.setDescription(policy.description);
            policyInfo.setEnforcementlevel(mapEnforcementLevel(policy.enforcementLevel));

            policyInfos.push(policyInfo);
        }
        resp.setPoliciesList(policyInfos);

        callback(undefined, resp);
    };
}

async function getPluginInfoRpc(call: any, callback: any): Promise<void> {
    const resp: any = new plugproto.PluginInfo();
    resp.setVersion(version);
    callback(undefined, resp);
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
                        const policyViolated = rule(
                            req.getType(),
                            req.getProperties().toJavaScript(),
                        );
                    } catch (e) {
                        if (e instanceof AssertionError) {
                            // `Diagnostic` is just an `AdmissionPolicy` without a `rule` field.
                            const { rules, name, ...diag } = p;

                            let expectation = e.message;
                            if (
                                e.message !== "" ||
                                e.message !== undefined ||
                                (e.generatedMessage === true && e.message === "false == true")
                            ) {
                                expectation = `expected '${e.expected}', got '${e.actual}'`;
                            }
                            const message = `${name}\nDetails: ${diag.description}\n${expectation}`;

                            ds.push({
                                policyName: name,
                                policyPackName,
                                policyPackVersion,
                                message: message,
                                ...diag,
                            });
                        } else {
                            if (e instanceof Error) {
                                throw new Error(
                                    `Error validating resource with policy ${p.name}:\n${e.stack}`,
                                );
                            } else {
                                throw new Error(
                                    `Error validating resource with policy ${p.name}:\n${e}`,
                                );
                            }
                        }
                    }
                }
            }
        } catch (err) {
            callback(err, undefined);
            return;
        }

        // Now marshal the results into a resulting diagnostics list, and invoke the callback to finish.
        callback(undefined, createAnalyzeResponse(ds));
    };
}

// ------------------------------------------------------------------------------------------------

// Server interfaces. Internal types used by the policy RPC server to respond to requests for (e.g.)
// policy analysis (via `Analyze`).

// ------------------------------------------------------------------------------------------------

/**
 * Diagnostic information and metadata that can be used to emit helpful error messages when a policy
 * is violated.
 */
interface Diagnostic {
    /** Name of the policy that was violated. */
    policyName: string;

    /** Name of the policy pack that the violated policy was a part of. */
    policyPackName: string;

    /** Version of the policy pack. */
    policyPackVersion: string;

    /**
     * A brief description of the policy rule. e.g., "S3 buckets should have default encryption
     * enabled."
     */
    description: string;

    /**
     * A detailed message to display on policy violation. Typically includes an explanation of the
     * policy, and steps to take to remediate.
     */
    message: string;

    /**
     * A keyword or term to associate with a policy, such as "cost" or "security."
     */
    tags?: Tag[];

    /**
     * Indicates what to do on policy violation, e.g., block deployment but allow override with
     * proper permissions.
     */
    enforcementLevel: EnforcementLevel;
}

// ------------------------------------------------------------------------------------------------

// RPC utilities. Translates the requests and results of the Analyzer gRPC interface into structures
// that are more managable and convenient.

// ------------------------------------------------------------------------------------------------

// createAnalyzeResponse creates a protobuf encoding the given list of diagnostics.
function createAnalyzeResponse(ds: Diagnostic[]) {
    const resp = new analyzerproto.AnalyzeResponse();

    const diagnostics = [];
    for (const d of ds) {
        const diagnostic = new analyzerproto.AnalyzeDiagnostic();
        diagnostic.setPolicyname(d.policyName);
        diagnostic.setPolicypackname(d.policyPackName);
        diagnostic.setPolicypackversion(d.policyPackVersion);
        diagnostic.setDescription(d.description);
        diagnostic.setMessage(d.message);
        diagnostic.setTagsList(d.tags);
        diagnostic.setEnforcementlevel(mapEnforcementLevel(d.enforcementLevel));

        diagnostics.push(diagnostic);
    }
    resp.setDiagnosticsList(diagnostics);

    return resp;
}

function mapEnforcementLevel(el: EnforcementLevel) {
    switch (el) {
        case "advisory":
            return analyzerproto.EnforcementLevel.ADVISORY;
        case "mandatory":
            return analyzerproto.EnforcementLevel.MANDATORY;
        default:
            throw Error(`Unknown enforcement level type '${el}'`);
    }
}
