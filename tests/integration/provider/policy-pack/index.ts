// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as assert from "assert";

import * as pulumi from "@pulumi/pulumi";
import { PolicyPack, PolicyResource, ResourceValidationArgs } from "@pulumi/policy";

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

function validate(r: ResourceValidationArgs | PolicyResource) {
    switch (r.type) {
        case "pulumi:pulumi:Stack":
        case "pulumi:providers:pulumi-nodejs":
        case "pulumi:providers:random":
            assert.strictEqual(r.provider, undefined);
            break;

        case "pulumi-nodejs:dynamic:Resource":
            assert.notStrictEqual(r.provider, undefined);
            assert.strictEqual(r.provider!.type, "pulumi:providers:pulumi-nodejs");
            assert.strictEqual(r.provider!.name, "default");
            assert.strictEqual(r.provider!.urn, createURN("pulumi:providers:pulumi-nodejs", "default"));
            assert.deepStrictEqual(r.provider!.props, {});
            break;

        case "random:index/randomUuid:RandomUuid":
            assert.notStrictEqual(r.provider, undefined);
            assert.strictEqual(r.provider!.type, "pulumi:providers:random");
            assert.strictEqual(r.provider!.name, "default_4_0_0");
            assert.strictEqual(r.provider!.urn, createURN("pulumi:providers:random", "default_4_0_0"));
            assert.notStrictEqual(r.provider!.props, undefined);
            assert.deepStrictEqual(r.provider!.props.version, "4.0.0");
            break;

        case "random:index/randomString:RandomString":
            assert.notStrictEqual(r.provider, undefined);
            assert.strictEqual(r.provider!.type, "pulumi:providers:random");
            assert.strictEqual(r.provider!.name, "my-provider");
            assert.strictEqual(r.provider!.urn, createURN("pulumi:providers:random", "my-provider"));
            assert.notStrictEqual(r.provider!.props, undefined);
            assert.deepStrictEqual(r.provider!.props.version, "4.0.0");
            break;

        default:
            throw Error(`Unexpected resource of type: '${r.type}'.`);
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
