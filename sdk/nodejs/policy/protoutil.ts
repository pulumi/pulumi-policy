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

import { EnforcementLevel, Policies, PolicyPackConfig } from "./policy";

const analyzerproto = require("@pulumi/pulumi/proto/analyzer_pb.js");
const analyzerrpc = require("@pulumi/pulumi/proto/analyzer_grpc_pb.js");
const structproto = require("google-protobuf/google/protobuf/struct_pb.js");
const plugproto = require("@pulumi/pulumi/proto/plugin_pb.js");

/** @internal */
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
 * @internal
 */
export interface Diagnostic {
    /** Name of the policy that was violated. */
    policyName: string;

    /** Name of the policy pack that the violated policy was a part of. */
    policyPackName: string;

    /** Version of the Policy Pack. */
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

    /**
     * The URN of the resource that has the policy violation.
     */
    urn?: string;
}

// ------------------------------------------------------------------------------------------------

// RPC utilities. Translates the requests and results of the Analyzer gRPC interface into structures
// that are more managable and convenient.

// ------------------------------------------------------------------------------------------------

/** @internal */
export function makeAnalyzerInfo(
    policyPackName: string,
    policyPackVersion: string,
    policyPackEnforcementLevel: EnforcementLevel,
    policies: Policies,
    initialConfig?: PolicyPackConfig,
): any {
    const ai: any = new analyzerproto.AnalyzerInfo();
    ai.setName(policyPackName);
    ai.setVersion(policyPackVersion);
    ai.setSupportsconfig(true);

    const policyInfos: any[] = [];
    for (const policy of policies) {
        const policyInfo = new analyzerproto.PolicyInfo();
        policyInfo.setName(policy.name);
        policyInfo.setDescription(policy.description);
        policyInfo.setEnforcementlevel(mapEnforcementLevel(policy.enforcementLevel || policyPackEnforcementLevel));

        if (policy.configSchema) {
            const schema = new analyzerproto.PolicyConfigSchema();
            schema.setProperties(structproto.Struct.fromJavaScript(policy.configSchema.properties));
            schema.setRequiredList(policy.configSchema.required);
            policyInfo.setConfigschema(schema);
        }

        policyInfos.push(policyInfo);
    }
    ai.setPoliciesList(policyInfos);

    if (initialConfig) {
        const normalizedConfig = normalizeConfig(initialConfig);
        let configMap;
        for (const key of Object.keys(normalizedConfig)) {
            const val = normalizedConfig[key];
            let config;
            if (val.enforcementLevel) {
                config = new analyzerproto.PolicyConfig();
                config.setEnforcementlevel(mapEnforcementLevel(val.enforcementLevel));
            }
            if (val.properties) {
                config = config || new analyzerproto.PolicyConfig();
                config.setProperties(structproto.Struct.fromJavaScript(val.properties));
            }
            if (config) {
                configMap = configMap || ai.getInitialconfigMap();
                configMap.set(key, config);
            }
        }
    }

    return ai;
}

/**
 * makeAnalyzeResponse creates a protobuf encoding the given list of diagnostics.
 * @internal
 */
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
        diagnostic.setUrn(d.urn);

        diagnostics.push(diagnostic);
    }
    resp.setDiagnosticsList(diagnostics);

    return resp;
}

/** @internal */
export function mapEnforcementLevel(el: EnforcementLevel) {
    switch (el) {
        case "advisory":
            return analyzerproto.EnforcementLevel.ADVISORY;
        case "mandatory":
            return analyzerproto.EnforcementLevel.MANDATORY;
        case "remediate":
            return analyzerproto.EnforcementLevel.REMEDIATE;
        case "disabled":
            return analyzerproto.EnforcementLevel.DISABLED;
        default:
            throw new UnknownEnforcementLevelError(el);
    }
}

/** @internal */
export function convertEnforcementLevel(el: number): EnforcementLevel {
    switch (el) {
        case analyzerproto.EnforcementLevel.ADVISORY:
            return "advisory";
        case analyzerproto.EnforcementLevel.MANDATORY:
            return "mandatory";
        case analyzerproto.EnforcementLevel.REMEDIATE:
            return "remediate";
        case analyzerproto.EnforcementLevel.DISABLED:
            return "disabled";
        default:
            throw new Error(`Unknown enforcement level ${el}.`);
    }
}

type NormalizedConfig = { [policy: string]: NormalizedConfigValue };
type NormalizedConfigValue = { enforcementLevel?: EnforcementLevel; properties?: Record<string, any> };

/** @internal */
export function normalizeConfig(config: PolicyPackConfig): NormalizedConfig {
    const result: NormalizedConfig = {};
    for (const key of Object.keys(config)) {
        const val = config[key];

        // If the value is a string, it's just an enforcement level.
        if (typeof val === "string") {
            result[key] = { enforcementLevel: val };
            continue;
        }

        // Otherwise, it's an object that may have an enforcement level and additional
        // properties.
        let resultVal: NormalizedConfigValue | undefined;
        if (val.enforcementLevel) {
            resultVal = {};
            resultVal.enforcementLevel = val.enforcementLevel;
        }
        const { enforcementLevel, ...properties } = val;
        if (Object.keys(properties).length > 0) {
            resultVal = resultVal || {};
            resultVal.properties = properties;
        }
        if (resultVal) {
            result[key] = resultVal;
        }
    }
    return result;
}

// Ensures all possible values are covered in the switch.
class UnknownEnforcementLevelError extends Error {
    constructor(el: never) {
        super(`Unknown enforcement level type '${el}'`);
    }
}

/**
 * Remediation conveys the policy remediation's effects on a resource, if any.
 * @internal
 */
export interface Remediation {
    /** Name of the policy doing the remediation. */
    policyName: string;

    /** Name of the policy pack that the policy was a part of. */
    policyPackName: string;

    /** Version of the Policy Pack. */
    policyPackVersion: string;

    /**
     * A brief description of the policy remediation. e.g., "Auto-tag S3 buckets."
     */
    description: string;

    /**
     * The remediated resource's properties to use in place of the input ones.
     */
    properties?: Record<string, any>;

    /**
     * An optional diagnostic string in the case that something went wrong.
     */
    diagnostic?: string;
}

/**
 * makeRemediateResponse creates a protobuf encoding the returned property bag.
 * @internal
 */
export function makeRemediateResponse(rs: Remediation[]) {
    const resp = new analyzerproto.RemediateResponse();

    const remediations = [];
    for (const r of rs) {
        if (!r.properties && !r.diagnostic) {
            throw new Error("Expected a remediation to have either properties or a diagnostic");
        }

        const remediation = new analyzerproto.Remediation();
        remediation.setPolicyname(r.policyName);
        remediation.setPolicypackname(r.policyPackName);
        remediation.setPolicypackversion(r.policyPackVersion);
        remediation.setDescription(r.description);
        remediation.setProperties(structproto.Struct.fromJavaScript(r.properties));
        remediation.setDiagnostic(r.diagnostic);
        remediations.push(remediation);
    }
    resp.setRemediationsList(remediations);

    return resp;
}
