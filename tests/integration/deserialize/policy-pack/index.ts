// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as assert from "assert";

import * as pulumi from "@pulumi/pulumi";
import { PolicyPack, PolicyResource, ResourceValidationArgs } from "@pulumi/policy";

new PolicyPack("deserialize-policy", {
    enforcementLevel: "mandatory",
    policies: [
        {
            enforcementLevel: "remediate",
            name: "resource-validation",
            description: "Verifies deserialized properties during resource validation.",
            validateResource: (args, reportViolation) => {
                verify(args);
            },
            remediateResource: (args) => {
                verify(args);
            },
        },
        {
            name: "stack-validation",
            description: "Verifies deserialized properties during stack validation.",
            validateStack: (args, reportViolation) => {
                for (const r of args.resources) {
                    verify(r);
                }
            },
        },
    ],
});

function verify(r: PolicyResource | ResourceValidationArgs) {
    if (r.type !== "pulumi-nodejs:dynamic:Resource") {
        return;
    }

    assert.strictEqual(r.props.secret, "a secret value");

    assert.deepStrictEqual(r.props.fileAsset.path, Promise.resolve("index.ts"));
    assert.ok(pulumi.asset.FileAsset.isInstance(r.props.fileAsset));

    assert.deepStrictEqual(r.props.stringAsset.text, Promise.resolve("some text"));
    assert.ok(pulumi.asset.StringAsset.isInstance(r.props.stringAsset));

    assert.deepStrictEqual(r.props.fileArchive.path, Promise.resolve("."));
    assert.ok(pulumi.asset.FileArchive.isInstance(r.props.fileArchive));

    assert.deepStrictEqual(r.props.assetArchive.assets, Promise.resolve({
        fileAsset: new pulumi.asset.FileAsset("index.ts"),
        stringAsset: new pulumi.asset.StringAsset("some text"),
        fileArchive: new pulumi.asset.FileArchive("."),
    }));
    assert.ok(pulumi.asset.AssetArchive.isInstance(r.props.assetArchive));
}
