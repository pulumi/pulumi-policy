// Copyright 2016-2019, Pulumi Corporation.  All rights reserved.

import { PolicyPack, validateTypedResource } from "@pulumi/policy";
import * as random from "@pulumi/random";

new PolicyPack("validate-resource-test-policy", {
    policies: [
        {
            name: "randomuuid-no-keepers",
            description: "Prohibits creating a RandomUuid without any 'keepers'.",
            enforcementLevel: "mandatory",
            validateResource: validateTypedResource(random.RandomUuid, (it, args, reportViolation) => {
                if (!it.keepers || Object.keys(it.keepers).length === 0) {
                    reportViolation("RandomUuid must not have an empty 'keepers'.")
                }
            }),
        },
    ],
});
