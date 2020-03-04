// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as assert from "assert";

import * as pulumi from "@pulumi/pulumi";
import { PolicyConfigSchema, PolicyPack } from "@pulumi/policy";

const config = new pulumi.Config();
const testScenario = config.requireNumber("scenario");

let schema: PolicyConfigSchema;
let verify: (args: { getConfig<T extends object>(): T }) => void;

switch (testScenario) {
    case 1:
        schema = {
            properties: {
                foo: { type: "string" },
            },
            required: [],
        };
        verify = (args) => {
            const config = args.getConfig<{ foo?: string }>();
            assert.strictEqual(config.foo, "bar");
        };
        break;

    default:
        throw new Error(`Unexpected testScenario ${testScenario}.`);
}

new PolicyPack("config-policy", {
    policies: [
        {
            name: "resource-validation",
            description: "Verifies policy config during resource validation.",
            enforcementLevel: "mandatory",
            configSchema: schema,
            validateResource: (args, reportViolation) => {
                verify(args);
            },
        },
        {
            name: "stack-validation",
            description: "Verifies policy config during stack validation.",
            enforcementLevel: "mandatory",
            configSchema: schema,
            validateStack: (args, reportViolation) => {
                verify(args);
            },
        },
    ],
});
