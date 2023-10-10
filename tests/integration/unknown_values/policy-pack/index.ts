// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import {
    PolicyPack,
    remediateResourceOfType,
    validateStackResourcesOfType,
    validateResourceOfType,
} from "@pulumi/policy";

import * as random from "@pulumi/random";

new PolicyPack("unknown-values-policy", {
    policies: [
        {
            name: "unknown-values-resource-validation",
            description: "Accessing unknown values during preview results in a violation.",
            enforcementLevel: "mandatory",
            validateResource: validateResourceOfType(random.RandomPet, (pet, args, reportViolation) => {
                // Accessing `.prefix` is expected to result in a policy violation because its value is unknown
                // during previews given the associated Pulumi program.
                console.log(pet.prefix);
            }),
            remediateResource: remediateResourceOfType(random.RandomPet, (pet, args) => {
                // Accessing `.prefix` is expected to result in a policy violation because its value is unknown
                // during previews given the associated Pulumi program.
                console.log(pet.prefix);
            }),
        },
        {
            name: "unknown-values-stack-validation",
            description: "Accessing unknown values during preview results in a violation.",
            enforcementLevel: "mandatory",
            validateStack: validateStackResourcesOfType(random.RandomPet, (pets, args, reportViolation) => {
                for (const pet of pets) {
                    // Accessing `.prefix` is expected to result in a policy violation because its value is unknown
                    // during previews given the associated Pulumi program.
                    console.log(pet.prefix);
                }
            }),
        },
    ],
});
