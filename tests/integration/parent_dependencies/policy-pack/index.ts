// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as assert from "assert";

import { PolicyPack, PolicyResource } from "@pulumi/policy";

new PolicyPack("parent-dependencies-test-policy", {
    policies: [
        {
            name: "validate-stack",
            description: "Validates parent and dependencies during `validateStack`.",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                for (const r of args.resources) {
                    validate(args.resources, r);
                }
            },
        },
    ],
});

function validate(resources: PolicyResource[], r: PolicyResource) {
    const stack = resources.find(r => r.type === "pulumi:pulumi:Stack");
    assert.notStrictEqual(stack, undefined);

    switch (r.type) {
        case "pulumi:pulumi:Stack":
        case "pulumi:providers:pulumi-nodejs":
        case "pulumi:providers:random":
            assert.strictEqual(r.parent, undefined);
            assert.deepStrictEqual(r.dependencies, []);
            assert.deepStrictEqual(r.propertyDependencies, {});
            break;

        case "pulumi-nodejs:dynamic:Resource":
            switch (r.name) {
                case "child":
                    const parent = resources.find(r => r.name === "parent");
                    assert.notStrictEqual(parent, undefined);
                    assert.strictEqual(r.parent, parent);
                    assert.deepStrictEqual(r.dependencies, []);
                    assert.deepStrictEqual(r.propertyDependencies, {});
                    break;

                case "b":
                    assert.strictEqual(r.parent, stack);
                    const a = resources.find(r => r.name === "a");
                    assert.notStrictEqual(a, undefined);
                    assert.strictEqual(r.dependencies.length, 1);
                    assert.strictEqual(r.dependencies[0], a);
                    assert.deepStrictEqual(r.propertyDependencies, {});
                    break;
            }
            break;

        case "random:index/randomString:RandomString":
            assert.strictEqual(r.parent, stack);
            assert.deepStrictEqual(r.dependencies, []);
            assert.deepStrictEqual(r.propertyDependencies, {});
            break;

        case "random:index/randomPet:RandomPet":
            assert.strictEqual(r.parent, stack);
            const str = resources.find(r => r.name === "str");
            assert.notStrictEqual(str, undefined);
            assert.deepStrictEqual(r.dependencies, [str]);
            assert.deepStrictEqual(r.propertyDependencies, { prefix: [str] });
            break;

        default:
            throw Error(`Unexpected resource of type: '${r.type}'.`);
    }
}
