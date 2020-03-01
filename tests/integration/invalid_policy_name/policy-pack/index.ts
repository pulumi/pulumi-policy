// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import { PolicyPack } from "@pulumi/policy";

new PolicyPack("invalid-policy-name", {
    policies: [
        {
            name: "all",
            description: "Invalid policy name.",
            enforcementLevel: "mandatory",
            validateResource: (args, reportViolation) => { throw new Error("Should never run."); },
        },
    ],
});
