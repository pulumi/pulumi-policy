// Copyright 2016-2019, Pulumi Corporation.  All rights reserved.

import { PolicyPack, validateTypedResources } from "@pulumi/policy";

import * as random from "@pulumi/random";

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
                            reportViolation("'state' must not have the value 1.");
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
                            reportViolation("'state' must not have the value 2.");
                        }
                    }
                }
            },
        },
        // Policy that specifies the URN of the resource violating the policy.
        {
            name: "dynamic-no-state-with-value-3",
            description: "Prohibits setting state to 3 on dynamic resources.",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                for (const r of args.resources) {
                    // FIXME: We don't have any outputs during previews and aren't merging
                    // inputs, so just skip for now if we have an empty props.
                    if (Object.keys(r.props).length === 0) {
                        continue;
                    }

                    if (r.type === "pulumi-nodejs:dynamic:Resource") {
                        if (r.props.state === 3) {
                            reportViolation("'state' must not have the value 3.", r.urn);
                        }
                    }
                }
            },
        },
        // Strongly-typed.
        {
            name: "randomuuid-no-keepers",
            description: "Prohibits creating a RandomUuid without any 'keepers'.",
            enforcementLevel: "mandatory",
            validateStack: validateTypedResources(random.RandomUuid, (resources, args, reportViolation) => {
                for (const r of resources) {
                    if (!r.keepers || Object.keys(r.keepers).length === 0) {
                        reportViolation("RandomUuid must not have an empty 'keepers'.");
                    }
                }
            }),
        },
        // Manual strongly-typed.
        {
            name: "no-randomstrings",
            description: "Prohibits RandomString resources.",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                const resources = args.resources
                    .map(r => r.isType(random.RandomString))
                    .filter(r => r);
                if (resources.length > 0) {
                    reportViolation("RandomString resources are not allowed.");
                }
            },
        },
        // Validate other type checks work as expected.
        {
            name: "test-type-checks",
            description: "Policy used to test type checks.",
            enforcementLevel: "mandatory",
            validateStack: (args, reportViolation) => {
                for (const r of args.resources) {
                    if (r.type !== "random:index/randomPassword:RandomPassword") {
                        continue;
                    }
                    if (!r.isType(random.RandomPassword)) {
                        throw new Error("`isType` did not return the expected value.");
                    }
                    const randomPassword = r.asType(random.RandomPassword);
                    if (!randomPassword) {
                        throw new Error("`asType` did not return the expected value.");
                    }
                    if (randomPassword.length !== 42) {
                        throw new Error("`randomPassword.length` did not return the expected value.");
                    }
                }
            },
        },
        // Validate that `args.resources` is filtered and matches the resources in `resources`.
        {
            name: "test-args-filtering",
            description: "Policy used to test that `args.resources` is filtered and matches the resources in `resources`.",
            enforcementLevel: "mandatory",
            validateStack: validateTypedResources(random.RandomInteger, (resources, args, reportViolation) => {
                if (resources.length !== args.resources.length) {
                    throw new Error("`args.resources.length` does not match `resources.length`.");
                }
                for (let i = 0; i < resources.length; i++) {
                    if (resources[i].id !== args.resources[i].props.id) {
                        throw new Error("`resources[i].id` does not match `args.resources[i].props.id`.");
                    }
                }
            }),
        },
    ],
});
