# Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import pulumi

from pulumi_policy import (
    EnforcementLevel,
    PolicyPack,
    ResourceValidationPolicy,
    StackValidationPolicy,
)


def validate_resource(args, report_violation):
    verify(args)


def remediate_resource(args):
    verify(args)


def validate_stack(args, report_violation):
    for r in args.resources:
        verify(r)


def verify(r):
    t = r.resource_type
    if t != "random:index/randomPet:RandomPet":
        return

    # Accessing `prefix` is expected to result in a policy violation because its value is unknown
    # during previews given the associated Pulumi program.
    print(r.props["prefix"])


PolicyPack(
    name="unknown-values-policy",
    policies=[
        ResourceValidationPolicy(
            enforcement_level=EnforcementLevel.REMEDIATE,
            name="unknown-values-resource-validation",
            description="Accessing unknown values during preview results in a violation.",
            validate=validate_resource,
            remediate=remediate_resource,
        ),
        StackValidationPolicy(
            enforcement_level=EnforcementLevel.MANDATORY,
            name="unknown-values-stack-validation",
            description="Accessing unknown values during preview results in a violation.",
            validate=validate_stack,
        ),
    ],
)
