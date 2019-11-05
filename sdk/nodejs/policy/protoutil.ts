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

import { EnforcementLevel, Policies } from "./policy";

export function asGrpcError(e: any, message?: string) {
    if (message === undefined || message === "") {
        message = "";
    } else {
        message = message + ":\n";
    }

    //
    // gRPC throws away the stack trace of `Error`. We choose to preserve it.
    //

    if (e instanceof Error) {
        return new Error(`${message}${e.stack}`);
    } else {
        return new Error(`${message}${e}`);
    }
}

// ------------------------------------------------------------------------------------------------

// Server interfaces. Internal types used by the policy RPC server to respond to requests for (e.g.)
// policy analysis (via `Analyze`).

// ------------------------------------------------------------------------------------------------

/**
 * Diagnostic information and metadata that can be used to emit helpful error messages when a policy
 * is violated.
 */
export interface Diagnostic {
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
     * Indicates what to do on policy violation, e.g., block deployment but allow override with
     * proper permissions.
     */
    enforcementLevel: EnforcementLevel;
}

// ------------------------------------------------------------------------------------------------

// RPC utilities. Translates the requests and results of the Analyzer gRPC interface into structures
// that are more managable and convenient.

// ------------------------------------------------------------------------------------------------

export function makeAnalyzerInfo(policyPackName: string, policies: Policies): any {
    const ai: any = new analyzerproto.AnalyzerInfo();
    ai.setName(policyPackName);

    const policyInfos: any[] = [];
    for (const policy of policies) {
        const policyInfo = new analyzerproto.PolicyInfo();
        policyInfo.setName(policy.name);
        policyInfo.setDescription(policy.description);
        policyInfo.setEnforcementlevel(mapEnforcementLevel(policy.enforcementLevel));

        policyInfos.push(policyInfo);
    }
    ai.setPoliciesList(policyInfos);

    return ai;
}

// makeAnalyzeResponse creates a protobuf encoding the given list of diagnostics.
export function makeAnalyzeResponse(ds: Diagnostic[]) {
    const resp = new analyzerproto.AnalyzeResponse();

    const diagnostics = [];
    for (const d of ds) {
        const diagnostic = new analyzerproto.AnalyzeDiagnostic();
        diagnostic.setPolicyname(d.policyName);
        diagnostic.setPolicypackname(d.policyPackName);
        diagnostic.setPolicypackversion(d.policyPackVersion);
        diagnostic.setDescription(d.description);
        diagnostic.setMessage(d.message);
        diagnostic.setEnforcementlevel(mapEnforcementLevel(d.enforcementLevel));

        diagnostics.push(diagnostic);
    }
    resp.setDiagnosticsList(diagnostics);

    return resp;
}

export function mapEnforcementLevel(el: EnforcementLevel) {
    switch (el) {
        case "advisory":
            return analyzerproto.EnforcementLevel.ADVISORY;
        case "mandatory":
            return analyzerproto.EnforcementLevel.MANDATORY;
        default:
            throw Error(`Unknown enforcement level type '${el}'`);
    }
}
