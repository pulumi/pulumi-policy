// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";
import { PolicyPack } from "@pulumi/policy";

const config = new pulumi.Config();
const testScenario = config.requireNumber("scenario");

switch (testScenario) {
    case 1:
        new PolicyPack("invalid-policy", {
            policies: [
                {
                    name: "all",
                    description: "Invalid policy name.",
                    enforcementLevel: "mandatory",
                    validateResource: (args, reportViolation) => { throw new Error("Should never run."); },
                },
            ],
        });
        break;

    case 2:
        new PolicyPack("invalid-policy", {
            policies: [
                {
                    name: "foo",
                    description: "Invalid schema: enforcementLevel cannot be added to `properties`.",
                    enforcementLevel: "mandatory",
                    config: {
                        properties: {
                            enforcementLevel: { type: "string" },
                        },
                    },
                    validateResource: (args, reportViolation) => { throw new Error("Should never run."); },
                },
            ],
        });
        break;

    case 3:
        new PolicyPack("invalid-policy", {
            policies: [
                {
                    name: "foo",
                    description: "Invalid schema: enforcementLevel cannot be added to `required`.",
                    enforcementLevel: "mandatory",
                    config: {
                        properties: {
                            foo: { type: "string" },
                        },
                        required: ["enforcementLevel"],
                    },
                    validateResource: (args, reportViolation) => { throw new Error("Should never run."); },
                },
            ],
        });
        break;
}
