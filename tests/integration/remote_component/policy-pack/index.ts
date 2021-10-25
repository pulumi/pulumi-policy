// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

import * as assert from "assert";

import { PolicyPack } from "@pulumi/policy";

new PolicyPack("remote-component-policy", {
    enforcementLevel: "mandatory",
    policies: [
        {
            name: "resource-validation",
            description: "Verifies properties during resource validation.",
            validateResource: (args, reportViolation) => {
                if (args.name !== "innerRandom") {
                    return;
                }

                assert.strictEqual(args.props.keepers.hello, "world");

                // Accessing `keepers.hi` is expected to result in a policy violation because its value is unknown
                // during previews given the associated Pulumi program.
                console.log(args.props.keepers.hi);
            },
        },

    ],
});
