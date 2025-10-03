// Copyright 2016-2025, Pulumi Corporation.  All rights reserved.

import { strict as assert } from "assert";

import { PolicyPack, ResourceValidationArgs, StackValidationArgs } from "@pulumi/policy";

new PolicyPack("stack-tags-policy", {
    policies: [
        {
            name: "stack-tags-resource-validation",
            description: "Verifies stack tags during resource validation.",
            enforcementLevel: "mandatory",
            validateResource: (args, reportViolation) => {
                verifyData(args);
            },
            remediateResource: (args) => {
                verifyData(args);
            },
        },
        {
            name: "stack-tags-stack-validation",
            description: "Verifies stack tags during stack validation.",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                verifyData(args);
            },
        },
    ],
});

function verifyData(args: ResourceValidationArgs | StackValidationArgs) {
    const expected = new Map([
        ["foo", "bar"],
        ["hello", "world"],
    ]);
    const actual = args.stackTags;

    for (const [k, v] of expected) {
        assert.ok(actual.has(k), `Missing key: ${k}`);
        assert.equal(
            actual.get(k),
            v,
            `Value mismatch for key "${k}": expected "${v}", got "${actual}"`
        );
    }
}
