# Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

from pulumi_policy import (
    EnforcementLevel,
    PolicyPack,
    ResourceValidationPolicy,
)


def verify(args):
    if args.name != "innerRandom":
        return

    assert args.props["keepers"]["hello"] == "world"

    # Accessing `keepers.hi` is expected to result in a policy violation because its value is unknown
    # during previews given the associated Pulumi program.
    print(args.props["keepers"]["hi"])


def validate_resource(args, report_violation):
    verify(args)


def remediate(args):
    verify(args)


PolicyPack(
    name="remote-component-policy",
    enforcement_level=EnforcementLevel.MANDATORY,
    policies=[
        ResourceValidationPolicy(
            name="resource-validation",
            description="Verifies properties during resource validation.",
            validate=validate_resource,
            remediate=remediate,
        ),
    ],
)
