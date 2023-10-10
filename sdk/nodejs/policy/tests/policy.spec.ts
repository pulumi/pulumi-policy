// Copyright 2016-2020, Pulumi Corporation.
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

import * as assert from "assert";

import * as pulumi from "@pulumi/pulumi";
import {
    remediateResourceOfType,
    ResourceValidationPolicy,
    StackValidationPolicy,
    validateResourceOfType,
    validateStackResourcesOfType,
} from "../policy";

import { asyncTest, runResourcePolicy, runResourceRemediation, runStackPolicy } from "./util";

function delay(t: number, v: string): Promise<string> {
    return new Promise((resolve) => {
        setTimeout(() => resolve(v), t);
    });
}

class Foo extends pulumi.Resource {
    constructor(name: string, args: FooArgs) {
        super("my:foo", name, false);
    }
}

interface FooArgs {
}

const empytOptions = {
    protect: false,
    ignoreChanges: [],
    aliases: [],
    customTimeouts: {
        createSeconds: 0,
        updateSeconds: 0,
        deleteSeconds: 0,
    },
    additionalSecretOutputs: [],
};

describe("validateResourceOfType", () => {
    it("works as expected with async policies", asyncTest(async () => {
        const policy: ResourceValidationPolicy = {
            name: "foo",
            description: "A test policy.",
            enforcementLevel: "mandatory",
            validateResource: validateResourceOfType(Foo, async (_, __, reportViolation) => {
                const response = await delay(100, "hi");
                reportViolation(response);
            }),
        };

        const args = {
            isType: () => true,  // true so the validation function always runs.
            asType: () => undefined,
            getConfig: <T>() => <T>{},
            type: "",
            props: {},
            urn: "",
            name: "",
            opts: empytOptions,
        };

        const violations = await runResourcePolicy(policy, args);

        assert.deepStrictEqual(violations, [{ message: "hi" }]);
    }));
});

describe("remediateResourceOfType", () => {
    it("works as expected with async policies", asyncTest(async () => {
        const policy: ResourceValidationPolicy = {
            name: "foo",
            description: "A test remediation.",
            enforcementLevel: "remediate",
            remediateResource: remediateResourceOfType(Foo, async (_, __) => {
                const response = await delay(100, "hi");
                return { "message": "bonjour" };
            }),
        };

        const args = {
            isType: () => true,  // true so the validation function always runs.
            asType: () => undefined,
            getConfig: <T>() => <T>{},
            type: "",
            props: {},
            urn: "",
            name: "",
            opts: empytOptions,
        };

        const remediation = await runResourceRemediation(policy, args);

        assert.deepStrictEqual(remediation, { message: "bonjour" });
    }));
});

describe("validateStackResourcesOfType", () => {
    it("works as expected with async policies", asyncTest(async () => {
        const policy: StackValidationPolicy = {
            name: "foo",
            description: "A test policy.",
            enforcementLevel: "mandatory",
            validateStack: validateStackResourcesOfType(Foo, async (_, __, reportViolation) => {
                const response = await delay(100, "hi");
                reportViolation(response);
            }),
        };

        const args = {
            getConfig: <T>() => <T>{},
            resources: [{
                isType: () => true, // true so the validation function always runs.
                asType: () => undefined,
                type: "",
                props: {},
                urn: "",
                name: "",
                opts: empytOptions,
                dependencies: [],
                propertyDependencies: {},
            }],
        };

        const violations = await runStackPolicy(policy, args);

        assert.deepStrictEqual(violations, [{ message: "hi" }]);
    }));
});
