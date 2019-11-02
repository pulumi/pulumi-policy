// Copyright 2016-2019, Pulumi Corporation.  All rights reserved.

import { PolicyPack, validateTypedResource } from "@pulumi/policy";
import * as random from "@pulumi/random";

new PolicyPack("validate-resource-test-policy", {
    policies: [
        {
            name: "dynamic-no-state-with-value-1",
            description: "Prohibits setting state to 1 on dynamic resources.",
            enforcementLevel: "mandatory",
            validateResource: (args, reportViolation) => {
                if (args.type === "pulumi-nodejs:dynamic:Resource") {
                    if (args.props.state === 1) {
                        reportViolation("'state' must not have the value 1.")
                    }
                }
            },
        },
        // More than one policy.
        {
            name: "dynamic-no-state-with-value-2",
            description: "Prohibits setting state to 2 on dynamic resources.",
            enforcementLevel: "mandatory",
            validateResource: (args, reportViolation) => {
                if (args.type === "pulumi-nodejs:dynamic:Resource") {
                    if (args.props.state === 2) {
                        reportViolation("'state' must not have the value 2.")
                    }
                }
            },
        },
        // Multiple validateResource callbacks.
        {
            name: "dynamic-no-state-with-value-3-or-4",
            description: "Prohibits setting state to 3 or 4 on dynamic resources.",
            enforcementLevel: "mandatory",
            validateResource: [
                (args, reportViolation) => {
                    if (args.type === "pulumi-nodejs:dynamic:Resource") {
                        if (args.props.state === 3) {
                            reportViolation("'state' must not have the value 3.")
                        }
                    }
                },
                (args, reportViolation) => {
                    if (args.type === "pulumi-nodejs:dynamic:Resource") {
                        if (args.props.state === 4) {
                            reportViolation("'state' must not have the value 4.")
                        }
                    }
                },
            ],
        },
        // Strongly-typed.
        {
            name: "randomuuid-no-keepers",
            description: "Prohibits creating a RandomUuid without any 'keepers'.",
            enforcementLevel: "mandatory",
            validateResource: validateTypedResource(random.RandomUuid.isInstance, (it, args, reportViolation) => {
                if (!it.keepers || Object.keys(it.keepers).length === 0) {
                    reportViolation("RandomUuid must not have an empty 'keepers'.")
                }
            }),
        },
    ],
});
