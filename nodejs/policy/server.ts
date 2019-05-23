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
const plugproto = require("@pulumi/pulumi/proto/plugin_pb.js");

import { EnforcementLevel, Rule, Tag } from "./policy";
import { version } from "./version";

// ------------------------------------------------------------------------------------------------

// Analyzer RPC implementation. Receives requests from the engine to validate (or `analyze`)
// resources, and validates them against a set of policies provided by the user. Failures are
// returned with metadata about the policy that was violated.

// ------------------------------------------------------------------------------------------------

let serving = false;

export function serve(args: string[], policies: Policy[]): void {
    if (serving !== false) {
        throw Error("Only one policy gRPC server can run per process");
    }

    serving = true;

    // The program requires a single argument: the address of the RPC endpoint for the engine.  It
    // optionally also takes a second argument, a reference back to the engine, but this may be
    // missing.
    if (args.length === 0) {
        console.error("fatal: Missing <engine> address");
        process.exit(-1);
        return;
    }
    const engineAddr: string = args[0];

    // Finally connect up the gRPC client/server and listen for incoming requests.
    const server = new grpc.Server();
    server.addService(analyzerrpc.AnalyzerService, {
        analyze: makeAnalyzeRpcFun(policies),
        getPluginInfo: getPluginInfoRpc,
    });
    const port: number = server.bind(`0.0.0.0:0`, grpc.ServerCredentials.createInsecure());

    server.start();

    // Emit the address so the monitor can read it to connect.  The gRPC server will keep the
    // message loop alive.
    console.log(port);
}

async function getPluginInfoRpc(call: any, callback: any): Promise<void> {
    const resp: any = new plugproto.PluginInfo();
    resp.setVersion(version);
    callback(undefined, resp);
}

// analyze is the RPC call that will analyze an individual resource, one at a time (i.e., check).
function makeAnalyzeRpcFun(policies: Policy[]) {
    return async function(call: any, callback: any): Promise<void> {
        // Prep to perform the analysis.
        const req = call.request;

        // Run the analysis for every analyzer in the global list, tracking any diagnostics.
        const ds: Diagnostic[] = [];
        try {
            for (const p of policies) {
                const policyViolated = p.rule(req.getType(), req.getProperties());
                if (policyViolated === true) {
                    // `Diagnostic` is just an `AdmissionPolicy` without a `rule` field.
                    const { rule, ...diag } = p;
                    ds.push({ ...diag });
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

export interface Policy {
    id: string;
    description: string;
    message?: string;
    tags?: Tag[];
    enforcementLevel: EnforcementLevel;
    rule: Rule;
}

/**
 * Diagnostic information and metadata that can be used to emit helpful error messages when a policy
 * is violated.
 */
interface Diagnostic {
    /** An ID for the policy. Must be unique to the current policy set. */
    id: string;

    /**
     * A brief description of the policy rule. e.g., "S3 buckets should have default encryption
     * enabled."
     */
    description: string;

    /**
     * A detailed message to display on policy violation. Typically includes an explanation of the
     * policy, and steps to take to remediate.
     */
    message?: string;

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
        diagnostic.setId(d.id);
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
        case "warning":
            return analyzerproto.AnalyzeDiagnostic.LogSeverity.WARNING;
        case "mandatory":
            return analyzerproto.AnalyzeDiagnostic.LogSeverity.MANDATORY;
        default:
            throw Error(`Unknown enforcement level type '${el}'`);
    }
}
