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

const analyzerproto = require("@pulumi/pulumi/proto/analyzer_pb.js");

import * as assert from "assert";

import { makeAnalyzeResponse, makeAnalyzerInfo, mapEnforcementLevel } from "../protoutil";

//
// This collection of tests exists as an insurance policy against the untyped JS code generated by
// the analyzer PB definitions. Our goal here is basically to make sure that we're not calling the
// wrong functions/methods when we're serializing the PB structs, as this causes a very bad user
// experience (among other things, malformatted PB messages and exceptions in serialization can
// cause gRPC to hang for a long time with no indication there was an error).
//

describe("mapEnforcementLevel", () => {
    it("works, basically", () => {
        assert.strictEqual(
            mapEnforcementLevel("advisory"),
            analyzerproto.EnforcementLevel.ADVISORY,
        );
        assert.strictEqual(
            mapEnforcementLevel("mandatory"),
            analyzerproto.EnforcementLevel.MANDATORY,
        );
        assert.throws(() => mapEnforcementLevel("disabled"));
        assert.throws(() => mapEnforcementLevel(<any>"invalidEnforcementLevel"));
    });
});

describe("makeAnalyzerInfo", () => {
    it("does not throw for reasonable policy packs", () => {
        assert.doesNotThrow(() => makeAnalyzerInfo("testRules", "1.0.0", []));
        assert.doesNotThrow(() => {
            makeAnalyzerInfo("testRules", "1.0.0", [
                {
                    name: "approved-amis-by-id",
                    description: "Instances should use approved AMIs",
                    enforcementLevel: "mandatory",
                    validateResource: (args, reportViolation) => { return; },
                },
            ]);
        });
    });

    it("throws for disabled or invalid enforcementLevel", () => {
        assert.throws(() => {
            makeAnalyzerInfo("testRules", "1.0.0", [
                {
                    name: "approved-amis-by-id",
                    description: "Instances should use approved AMIs",
                    enforcementLevel: "disabled",
                    validateResource: (args, reportViolation) => { return; },
                },
            ]);
        });
        assert.throws(() => {
            makeAnalyzerInfo("testRules", "1.0.0", [
                {
                    name: "approved-amis-by-id",
                    description: "Instances should use approved AMIs",
                    enforcementLevel: <any>"invalidEnforcementLevel",
                    validateResource: (args, reportViolation) => { return; },
                },
            ]);
        });
    });
});

describe("makeAnalyzeResponse", () => {
    it("does not throw for reasonable diagnostic responses", () => {
        assert.doesNotThrow(() => {
            makeAnalyzeResponse([]);
        });
        assert.doesNotThrow(() => {
            makeAnalyzeResponse([
                {
                    policyName: "approved-amis-by-id",
                    policyPackName: "awsSecRules",
                    policyPackVersion: "1.0.0",
                    description: "Instances should use approved AMIs",
                    message: "Did not use approved AMI",
                    enforcementLevel: "mandatory",
                },
            ]);
        });
        assert.doesNotThrow(() => {
            makeAnalyzeResponse([
                {
                    policyName: "approved-amis-by-id",
                    policyPackName: "awsSecRules",
                    policyPackVersion: "1.0.0",
                    description: "Instances should use approved AMIs",
                    message: "Did not use approved AMI",
                    enforcementLevel: "mandatory",
                    urn: "foo",
                },
            ]);
        });
    });

    it("throws for disabled or invalid enforcementLevel", () => {
        assert.throws(() => {
            makeAnalyzeResponse([
                {
                    policyName: "approved-amis-by-id",
                    policyPackName: "awsSecRules",
                    policyPackVersion: "1.0.0",
                    description: "Instances should use approved AMIs",
                    message: "Did not use approved AMI",
                    enforcementLevel: "disabled",
                },
            ]);
        });
        assert.throws(() => {
            makeAnalyzeResponse([
                {
                    policyName: "approved-amis-by-id",
                    policyPackName: "awsSecRules",
                    policyPackVersion: "1.0.0",
                    description: "Instances should use approved AMIs",
                    message: "Did not use approved AMI",
                    enforcementLevel: <any>"invalidEnforcementLevel",
                },
            ]);
        });
    });
});
