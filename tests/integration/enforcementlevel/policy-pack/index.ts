// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";
import { EnforcementLevel, PolicyPack } from "@pulumi/policy";

interface Scenario {
    pack?: EnforcementLevel;
    policy?: EnforcementLevel;
}

// Build a set of scenarios to test.
const enforcementLevels: (EnforcementLevel | undefined)[] = ["advisory", "disabled", "mandatory", undefined];
const scenarios: Scenario[] = [{}]
for (const pack of enforcementLevels) {
    for (const policy of enforcementLevels) {
        scenarios.push({
            ...(pack && { pack }),
            ...(policy && { policy }),
        })
    }
}

// Get the current scenario.
const config = new pulumi.Config();
const testScenario = config.requireNumber("scenario");
if (testScenario >= scenarios.length) {
    throw new Error(`Unexpected testScenario ${testScenario}.`);
}
const scenario: Scenario = scenarios[testScenario];

// Generate a Policy Pack name for the scenario.
const pack: string = scenario.pack || "none";
const policy: string = scenario.policy ? `-${scenario.policy}` : "";
const policyPackName = `enforcementlevel-${pack}${policy}-test-policy`;

// Whether the validate function should throw an exception (to validate that it doesn't run).
const validateFunctionThrows =
    (scenario.pack === "disabled" && (scenario.policy === "disabled" || !scenario.policy)) ||
    scenario.policy === "disabled";

// Create a Policy Pack instance for the scenario.
new PolicyPack(policyPackName, {
    // Conditionally set the policy pack's enforcementLevel if it is truthy.
    ...(scenario.pack && { enforcementLevel: scenario.pack }),

    policies: [
        {
            // Conditionally set the policy's enforcement level if it is truthy.
            ...(scenario.policy && { enforcementLevel: scenario.policy }),

            name: "validate-resource",
            description: "Always reports a resource violation.",
            validateResource: (args, reportViolation) => {
                if (validateFunctionThrows) {
                    throw new Error("validate-resource should never be called.");
                }
                reportViolation("validate-resource-violation-message");
            },
        },
        {
            // Conditionally set the policy's enforcement level if it is truthy.
            ...(scenario.policy && { enforcementLevel: scenario.policy }),

            name: "validate-stack",
            description: "Always reports a stack violation.",
            validateStack: (args, reportViolation) => {
                if (validateFunctionThrows) {
                    throw new Error("validate-stack should never be called.");
                }
                reportViolation("validate-stack-violation-message");
            },
        },
    ],
});
