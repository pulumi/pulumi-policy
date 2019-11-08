// Copyright 2016-2019, Pulumi Corporation.  All rights reserved.

import { PolicyPack } from "@pulumi/policy";

new PolicyPack("validate-stack-test-policy", {
    policies: [
        // // Temporary policy for debugging.
        // {
        //     name: "temporary-debug-policy",
        //     description: "Temp debug policy that reports violations for each resource to see their values.",
        //     enforcementLevel: "mandatory",
        //     validateStack: (args, reportViolation) => {
        //         for (const r of args.resources) {
        //             reportViolation(`${r.type} with props ${Object.keys(r.props).join(",")} failure`);
        //         }
        //     },
        // },
        {
            name: "dynamic-no-state-with-value-1",
            description: "Prohibits setting state to 1 on dynamic resources.",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                for (const r of args.resources) {
                    // FIXME: We don't have any outputs during previews and aren't merging
                    // inputs, so just skip for now if we have an empty props.
                    if (Object.keys(r.props).length === 0) {
                        continue;
                    }

                    if (r.type === "pulumi-nodejs:dynamic:Resource") {
                        if (r.props.state === 1) {
                            reportViolation("'state' must not have the value 1.")
                        }
                    }
                }
            },
        },
        // More than one policy.
        {
            name: "dynamic-no-state-with-value-2",
            description: "Prohibits setting state to 2 on dynamic resources.",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                for (const r of args.resources) {
                    // FIXME: We don't have any outputs during previews and aren't merging
                    // inputs, so just skip for now if we have an empty props.
                    if (Object.keys(r.props).length === 0) {
                        continue;
                    }

                    if (r.type === "pulumi-nodejs:dynamic:Resource") {
                        if (r.props.state === 2) {
                            reportViolation("'state' must not have the value 2.")
                        }
                    }
                }
            },
        },
    ],
});
