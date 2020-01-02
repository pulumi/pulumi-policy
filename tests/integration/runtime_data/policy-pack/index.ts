// Copyright 2016-2019, Pulumi Corporation.  All rights reserved.

import * as assert from "assert";

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PolicyPack, PolicyResource } from "@pulumi/policy";

new PolicyPack("runtime-data-policy", {
    policies: [
        {
            name: "runtime-data-resource-validation",
            description: "Verifies runtime data during resource validation.",
            enforcementLevel: "mandatory",
            validateResource: (args, reportViolation) => {
                verifyData(args);
            },
        },
        {
            name: "runtime-data-stack-validation",
            description: "Verifies runtime data during stack validation.",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                for (const r of args.resources) {
                    verifyData(r);
                }
            },
        },
    ],
});

function verifyData(r: PolicyResource) {
    if (r.type !== "pulumi-nodejs:dynamic:Resource") {
        return;
    }

    // Verify isDryRun().
    assert.strictEqual(pulumi.runtime.isDryRun(), r.props.isDryRun,
        "'isDryRun()' not the expected value (via resource prop).");

    // Verify getProject().
    assert.ok(process.env.PULUMI_TEST_PROJECT, "'PULUMI_TEST_PROJECT' not set.");
    assert.strictEqual(pulumi.getProject(), process.env.PULUMI_TEST_PROJECT, "'getProject()' not the expected value.");
    assert.strictEqual(pulumi.getProject(), r.props.getProject, "'getProject()' not the expected value.");

    // Verify getStack().
    assert.ok(process.env.PULUMI_TEST_STACK, "'PULUMI_TEST_STACK' not set.")
    assert.strictEqual(pulumi.getStack(), process.env.PULUMI_TEST_STACK,
        "'getStack()' not the expected value (via env var).");
    assert.strictEqual(pulumi.getStack(), r.props.getStack,
        "'getStack()' not the expected value (via resource prop).");

    // Verify Config.
    assert.deepStrictEqual(pulumi.runtime.allConfig(), r.props.allConfig,
        "'allConfig()' not the expected value (via resource prop).")
    const config = new pulumi.Config();
    const value = config.require("aConfigValue");
    assert.strictEqual(value, "this value is a value", "'aConfigValue' not the expected value.");
    assert.strictEqual(aws.config.region, "us-west-2", "'aws.config.region' not the expected value.");
}
