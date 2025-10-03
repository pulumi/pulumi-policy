// Copyright 2016-2025, Pulumi Corporation.
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

class Foo extends pulumi.Resource {
    constructor(name: string, args: FooArgs) {
        super("my:foo", name, false);
    }
}

interface FooArgs {
}

class Bar extends pulumi.Resource {
    static __pulumiType = "my:index:Bar";
    constructor(name: string, args: BarArgs) {
        super("my:index:Bar", name, false);
    }
}

interface BarArgs {
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
                await new Promise(resolve => setImmediate(resolve));
                reportViolation("hi");
            }),
        };

        const args = {
            isType: () => true,  // true so the validation function always runs.
            asType: () => undefined,
            getConfig: <T>() => <T>{},
            notApplicable: (reason?: string) => { throw new Error("not applicable"); },
            type: "",
            props: {},
            urn: "",
            name: "",
            opts: empytOptions,
            stackTags: new Map<string, string>(),
        };

        const violations = await runResourcePolicy(policy, args);

        assert.deepStrictEqual(violations, [{ message: "hi" }]);
    }));

    it("saves type info when available", () => {
        const validateResource = validateResourceOfType(Bar, (_, __, reportViolation) => {
            reportViolation("nope");
        });
        assert.strictEqual((validateResource as any).__pulumiType, "my:index:Bar");
    });
});

describe("remediateResourceOfType", () => {
    it("works as expected with async policies", asyncTest(async () => {
        const policy: ResourceValidationPolicy = {
            name: "foo",
            description: "A test remediation.",
            enforcementLevel: "remediate",
            remediateResource: remediateResourceOfType(Foo, async (_, __) => {
                await new Promise(resolve => setImmediate(resolve));
                return { "message": "bonjour" };
            }),
        };

        const args = {
            isType: () => true,  // true so the validation function always runs.
            asType: () => undefined,
            getConfig: <T>() => <T>{},
            notApplicable: (reason?: string) => { throw new Error("not applicable"); },
            type: "",
            props: {},
            urn: "",
            name: "",
            opts: empytOptions,
            stackTags: new Map<string, string>(),
        };

        const remediation = await runResourceRemediation(policy, args);

        assert.deepStrictEqual(remediation, { message: "bonjour" });
    }));

    it("saves type info when available", () => {
        const validateResource = remediateResourceOfType(Bar, (_, __) => undefined);
        assert.strictEqual((validateResource as any).__pulumiType, "my:index:Bar");
    });
});

describe("validateStackResourcesOfType", () => {
    it("works as expected with async policies", asyncTest(async () => {
        const policy: StackValidationPolicy = {
            name: "foo",
            description: "A test policy.",
            enforcementLevel: "mandatory",
            validateStack: validateStackResourcesOfType(Foo, async (_, __, reportViolation) => {
                await new Promise(resolve => setImmediate(resolve));
                reportViolation("hi");
            }),
        };

        const args = {
            getConfig: <T>() => <T>{},
            notApplicable: (reason?: string) => { throw new Error("not applicable"); },
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
            stackTags: new Map<string, string>(),
        };

        const violations = await runStackPolicy(policy, args);

        assert.deepStrictEqual(violations, [{ message: "hi" }]);
    }));

    it("saves type info when available", () => {
        const validateStack = validateStackResourcesOfType(Bar, (_, __, reportViolation) => {
            reportViolation("nope");
        });
        assert.strictEqual((validateStack as any).__pulumiType, "my:index:Bar");
    });
});
