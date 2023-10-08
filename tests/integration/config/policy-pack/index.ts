// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as assert from "assert";

import * as pulumi from "@pulumi/pulumi";
import {
    PolicyConfigSchema,
    PolicyPack,
    PolicyPackConfig,
    remediateResourceOfType,
    validateRemediateResourceOfType,
    validateResourceOfType,
} from "@pulumi/policy";
import * as random from "@pulumi/random";

interface TestScenario {
    schema: PolicyConfigSchema;
    initialConfig?: PolicyPackConfig;
    verify?: (args: { getConfig<T extends object>(): T }) => void;
}

const scenarios: TestScenario[] = [
    // Test scenario 1: String from config.
    {
        schema: {
            properties: {
                foo: { type: "string" },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo?: string }>();
            assert.strictEqual(config.foo, "bar");
        },
    },
    // Test scenario 2: Default string value specified in schema used.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                    default: "bar",
                },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo: string }>();
            assert.strictEqual(config.foo, "bar");
        },
    },
    // Test scenario 3: Default number value specified in schema used.
    {
        schema: {
            properties: {
                foo: {
                    type: "number",
                    default: 42,
                },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo: number }>();
            assert.strictEqual(config.foo, 42);
        },
    },
    // Test scenario 4: Specified config value overrides default value.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                    default: "bar",
                },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo: string }>();
            assert.strictEqual(config.foo, "overridden");
        },
    },
    // Test scenario 5: Default value specified in schema for required field used.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                    default: "bar",
                },
            },
            required: ["foo"],
        },
        verify: (args) => {
            const config = args.getConfig<{ foo: string }>();
            assert.strictEqual(config.foo, "bar");
        },
    },
    // Test scenario 6: Required config property not set.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                },
            },
            required: ["foo"],
        },
    },
    // Test scenario 7: Default value set to incorrect type.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                    default: 1,
                },
            },
        },
    },
    // Test scenario 8: Default value too long.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                    maxLength: 3,
                    default: "this value is too long",
                },
            },
        },
    },
    // Test scenario 9: Default value too short.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                    minLength: 50,
                    default: "this value is too short",
                },
            },
        },
    },
    // Test scenario 10: Default value set to invalid enum value.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                    enum: ["bar", "baz"],
                    default: "blah",
                },
            },
        },
    },
    // Test scenario 11: Default value set to invalid constant value.
    {
        schema: {
            properties: {
                foo: {
                    const: "bar",
                    default: "blah",
                },
            },
        },
    },
    // Test scenario 12: Incorrect type.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                },
            },
        },
    },
    // Test scenario 13: Invalid enum value.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                    enum: ["bar", "baz"],
                },
            },
        },
    },
    // Test scenario 14: Invalid constant value.
    {
        schema: {
            properties: {
                foo: {
                    const: "bar",
                },
            },
        },
    },
    // Test scenario 15: Invalid constant value.
    {
        schema: {
            properties: {
                foo: {
                    type: "string",
                    maxLength: 3,
                },
                bar: {
                    type: "integer",
                },
            },
        },
    },
    // Test scenario 16: Number (int) from config.
    {
        schema: {
            properties: {
                foo: { type: "number" },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo?: number }>();
            assert.strictEqual(config.foo, 42);
        },
    },
    // Test scenario 17: Number (float) from config.
    {
        schema: {
            properties: {
                foo: { type: "number" },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo?: number }>();
            assert.strictEqual(config.foo, 3.14);
        },
    },
    // Test scenario 18: Integer from config.
    {
        schema: {
            properties: {
                foo: { type: "integer" },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo?: number }>();
            assert.strictEqual(config.foo, 42);
        },
    },
    // Test scenario 19: Boolean (true) from config.
    {
        schema: {
            properties: {
                foo: { type: "boolean" },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo?: boolean }>();
            assert.strictEqual(config.foo, true);
        },
    },
    // Test scenario 20: Boolean (false) from config.
    {
        schema: {
            properties: {
                foo: { type: "boolean" },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo?: boolean }>();
            assert.strictEqual(config.foo, false);
        },
    },
    // Test scenario 21: Object from config.
    {
        schema: {
            properties: {
                foo: { type: "object" },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo?: { bar: string } }>();
            assert.deepStrictEqual(config.foo, { bar: "baz" });
        },
    },
    // Test scenario 22: Array from config.
    {
        schema: {
            properties: {
                foo: { type: "array" },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo?: string[] }>();
            assert.deepStrictEqual(config.foo, ["a", "b", "c"]);
        },
    },
    // Test scenario 23: Null from config.
    {
        schema: {
            properties: {
                foo: { type: "null" },
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo: null }>();
            assert.strictEqual(config.foo, null);
        },
    },
    // Test scenario 24: Initial config.
    {
        schema: {
            properties: {
                foo: { type: "string" },
            },
        },
        initialConfig: {
            "resource-validation": {
                foo: "hello world",
            },
            "stack-validation": {
                foo: "hello world",
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo: string }>();
            assert.strictEqual(config.foo, "hello world");
        },
    },
    // Test scenario 25: Initial config overridden.
    {
        schema: {
            properties: {
                foo: { type: "string" },
            },
        },
        initialConfig: {
            "resource-validation": {
                foo: "hello world",
            },
            "stack-validation": {
                foo: "hello world",
            },
        },
        verify: (args) => {
            const config = args.getConfig<{ foo: string }>();
            assert.strictEqual(config.foo, "overridden");
        },
    },
];

const config = new pulumi.Config();
const testScenario = config.requireNumber("scenario");

const index = testScenario - 1;
if (index < 0 || index >= scenarios.length) {
    throw new Error(`Unexpected testScenario ${testScenario}.`);
}

new PolicyPack("config-policy", {
    policies: [
        {
            name: "resource-validation",
            description: "Verifies policy config during resource validation.",
            enforcementLevel: "remediate",
            configSchema: scenarios[index].schema,
            validateResource: (args, reportViolation) => {
                scenarios[index].verify?.(args);
            },
            remediateResource: (args) => {
                scenarios[index].verify?.(args);
            },
        },
        {
            name: "stack-validation",
            description: "Verifies policy config during stack validation.",
            enforcementLevel: "mandatory",
            configSchema: scenarios[index].schema,
            validateStack: (args, reportViolation) => {
                scenarios[index].verify?.(args);
            },
        },
    ],
}, scenarios[index].initialConfig);
