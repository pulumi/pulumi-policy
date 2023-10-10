// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as assert from "assert";

import * as pulumi from "@pulumi/pulumi";
import { PolicyPack, PolicyResource, PolicyResourceOptions, ResourceValidationArgs } from "@pulumi/policy";

new PolicyPack("resource-options-test-policy", {
    policies: [
        {
            name: "validate-resource",
            description: "Validates resource options during `validateResource`.",
            enforcementLevel: "mandatory",
            validateResource: (args, reportViolation) => {
                validate(args);
            },
            remediateResource: (args) => {
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

function validate(r: ResourceValidationArgs | PolicyResource) {
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
        case "pulumi:providers:random":
            assert.deepStrictEqual(r.opts, {
                protect: false,
                ignoreChanges: [],
                aliases: [],
                additionalSecretOutputs: [],
                customTimeouts: {
                    createSeconds: 0,
                    updateSeconds: 0,
                    deleteSeconds: 0,
                },
            });
            break;

        case "pulumi-nodejs:dynamic:Resource":
            validateDynamicResource(r);
            break;

        case "random:index/randomUuid:RandomUuid":
            assert.deepStrictEqual(r.opts, {
                protect: false,
                ignoreChanges: [],
                aliases: [],
                additionalSecretOutputs: [],
                customTimeouts: {
                    createSeconds: 0,
                    updateSeconds: 0,
                    deleteSeconds: 0,
                },
            });
            break;

        default:
            throw Error(`Unexpected resource of type: '${r.type}'.`);
    }
}

function validateDynamicResource(r: ResourceValidationArgs | PolicyResource) {
    const defaultOptions: PolicyResourceOptions = {
        protect: false,
        ignoreChanges: [],
        aliases: [],
        additionalSecretOutputs: [],
        customTimeouts: {
            createSeconds: 0,
            updateSeconds: 0,
            deleteSeconds: 0,
        },
    };

    switch (r.name) {
        case "empty":
        case "parent":
        case "a":
            assert.deepStrictEqual(r.opts, defaultOptions);
            break;

        case "protect":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions, { protect: true }));
            break;

        case "ignoreChanges":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions, { ignoreChanges: ["foo", "bar"] }));
            break;

        case "deleteBeforeReplaceNotSet":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions));
            break;

        case "deleteBeforeReplaceTrue":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions, { deleteBeforeReplace: true }));
            break;

        case "deleteBeforeReplaceFalse":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions, { deleteBeforeReplace: false }));
            break;

        case "aliased":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions, {
                // Note that the engine explicitly does not preserve aliases pointing to resources that no
                // longer exist. Because we don't actually introduce real aliases here, "old-name-for-aliases"
                // is not paired up with a resource, and so the aliases array will be empty. If the engine
                // preserved these aliases, we would have instead checked for:
                // aliases: [createURN("pulumi-nodejs:dynamic:Resource", "old-name-for-aliased")],
                aliases: [],
            }));
            break;

        case "timeouts":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions, {
                customTimeouts: {
                    createSeconds: 60,
                    updateSeconds: 120,
                    deleteSeconds: 180,
                },
            }));
            break;

        case "timeouts-create":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions, {
                customTimeouts: {
                    createSeconds: 240,
                    updateSeconds: 0,
                    deleteSeconds: 0,
                },
            }));
            break;

        case "timeouts-update":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions, {
                customTimeouts: {
                    createSeconds: 0,
                    updateSeconds: 300,
                    deleteSeconds: 0,
                },
            }));
            break;

        case "timeouts-delete":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions, {
                customTimeouts: {
                    createSeconds: 0,
                    updateSeconds: 0,
                    deleteSeconds: 360,
                },
            }));
            break;

        case "secrets":
            assert.deepStrictEqual(r.opts, Object.assign({}, defaultOptions, {
                additionalSecretOutputs: ["foo"],
            }));
            break;

        default:
            throw Error(`Unexpected resource with name: '${r.name}'.`);
    }
}

/**
 * Creates a URN from the given `type` and `name`.
 * @param type the resource type.
 * @param name the resource name.
 */
function createURN(type: string, name: string): string {
    return `urn:pulumi:${pulumi.getStack()}::${pulumi.getProject()}::${type}::${name}`;
}
