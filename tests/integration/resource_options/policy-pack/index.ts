// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import { deepStrictEqual, ok, strictEqual } from "assert";

import * as pulumi from "@pulumi/pulumi";
import { PolicyPack, PolicyResource, PolicyResourceOptions } from "@pulumi/policy";

new PolicyPack("resource-options-test-policy", {
    policies: [
        {
            name: "validate-resource",
            description: "Validates resource options during `validateResource`.",
            enforcementLevel: "mandatory",
            validateResource: (args, reportViolation) => {
                validate(args);
            },
        },
        {
            name: "validate-stack",
            description: "Validates resource options during `validateStack`.",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                for (const r of args.resources) {
                    validate(r);
                }
            },
        },
    ],
});

function validate(r: PolicyResource) {
    const config = new pulumi.Config();
    const testScenario = config.requireNumber("scenario");

    // We only validate during the first test scenario. The subsequent test scenario is only
    // used to unprotect protected resources in preparation for destroying the stack.
    if (testScenario !== 1) {
        return;
    }

    switch (r.type) {
        case "pulumi:pulumi:Stack":
        case "pulumi:providers:pulumi-nodejs":
            assertOptions(r.opts, {
                protect: false,
                dependencies: [],
                provider: "",
                aliases: [],
                additionalSecretOutputs: [],
            }, /*providerExactMatch*/ true);
            break;

        case "pulumi-nodejs:dynamic:Resource":
            validateDynamicResource(r);
            break;

        case "random:index/randomUuid:RandomUuid":
            assertOptions(r.opts, {
                parent: getStackURN(),
                protect: false,
                dependencies: [],
                provider: getURN("pulumi:providers:random", "custom-random-provider"),
                aliases: [],
                additionalSecretOutputs: [],
            });
            break;
    }
}

function validateDynamicResource(r: PolicyResource) {
    const defaultOptions: PolicyResourceOptions = {
        parent: getStackURN(),
        protect: false,
        dependencies: [],
        provider: getURN("pulumi:providers:pulumi-nodejs", "default"),
        aliases: [],
        additionalSecretOutputs: [],
    };

    switch (r.name) {
        case "empty":
        case "parent":
        case "a":
            assertOptions(r.opts, defaultOptions);
            break;

        case "child":
            assertOptions(r.opts, Object.assign({}, defaultOptions, {
                parent: getURN("pulumi-nodejs:dynamic:Resource", "parent"),
            }));
            break;

        case "protect":
            assertOptions(r.opts, Object.assign({}, defaultOptions, { protect: true}));
            break;

        case "b":
            assertOptions(r.opts, Object.assign({}, defaultOptions, {
                dependencies: [getURN("pulumi-nodejs:dynamic:Resource", "a")],
            }));
            break;

        case "aliased":
            assertOptions(r.opts, Object.assign({}, defaultOptions, {
                aliases: [getURN("pulumi-nodejs:dynamic:Resource", "old-name-for-aliased")],
            }));
            break;

        case "timeouts":
            assertOptions(r.opts, Object.assign({}, defaultOptions, {
                customTimeouts: {
                    create: 60,
                    update: 120,
                    delete: 180,
                },
            }));
            break;

        case "timeouts-create":
            assertOptions(r.opts, Object.assign({}, defaultOptions, {
                customTimeouts: {
                    create: 240,
                },
            }));
            break;

        case "timeouts-update":
            assertOptions(r.opts, Object.assign({}, defaultOptions, {
                customTimeouts: {
                    update: 300,
                },
            }));
            break;

        case "timeouts-delete":
            assertOptions(r.opts, Object.assign({}, defaultOptions, {
                customTimeouts: {
                    delete: 360,
                },
            }));
            break;

        case "secrets":
            assertOptions(r.opts, Object.assign({}, defaultOptions, {
                additionalSecretOutputs: ["foo"],
            }));
            break;
    }
}

/**
 * Asserts that the `actual` options are strictly equal to the `expected` options.
 * @param actual the actual resource options.
 * @param expected the expected resource options.
 * @param providerExactMatch `true` for a strict equality check of the `provider` property,
 *     otherwise verifies `actual.provider` starts with `expected.provider` (as the actual
 *     provider may have a UUID appended).
 */
function assertOptions(actual: PolicyResourceOptions, expected: PolicyResourceOptions, providerExactMatch: boolean = false) {
    assert(strictEqual, actual, expected, "parent");
    assert(strictEqual, actual, expected, "protect");
    assert(deepStrictEqual, actual, expected, "dependencies");
    assert(deepStrictEqual, actual, expected, "aliases");
    assert(deepStrictEqual, actual, expected, "customTimeouts");
    assert(deepStrictEqual, actual, expected, "additionalSecretOutputs");

    const action = providerExactMatch ? strictEqual : startsWith;
    assert(action, actual, expected, "provider");
}

/**
 * Creates a URN of the root stack resource.
 */
function getStackURN(): string {
    return getURN("pulumi:pulumi:Stack", `${pulumi.getProject()}-${pulumi.getStack()}`);
}

/**
 * Creates a URN from the given `type` and `name`.
 * @param type the resource type.
 * @param name the resource name.
 */
function getURN(type: string, name: string): string {
    return `urn:pulumi:${pulumi.getStack()}::${pulumi.getProject()}::${type}::${name}`;
}

/**
 * Asserts that `actual` is truthy and starts with `expected`.
 * @param actual the actual value.
 * @param expected the expected value.
 * @param message the assertion message.
 */
function startsWith(actual: string, expected: string, message: string): void {
    ok(actual && actual.startsWith(expected), message);
}

/**
 * Calls `action`, passing the specified `property` of `actual` and `expected`.
 * @param action the assertion action to perform.
 * @param actual the actual resource options.
 * @param expected the expected resource options.
 * @param property the property of the resource options to check.
 */
function assert<K extends keyof PolicyResourceOptions>(
    action: (actual: PolicyResourceOptions[K], expected: PolicyResourceOptions[K], message: string) => void,
    actual: PolicyResourceOptions,
    expected: PolicyResourceOptions,
    property: K,
): void {
    const act = actual[property];
    const exp = expected[property];
    const msg = `'${property}' isn't the expected value.\n\n  Actual: '${act}'.\nExpected: '${exp}'.`;
    action(act, exp, msg);
}
