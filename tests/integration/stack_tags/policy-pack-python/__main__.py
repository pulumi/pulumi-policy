# Copyright 2016-2025, Pulumi Corporation.  All rights reserved.

from pulumi_policy import (
    EnforcementLevel,
    PolicyPack,
    ResourceValidationPolicy,
    StackValidationPolicy,
)


def validate_resource(args, report_violation):
    verify_data(args)


def remediate_resource(args, report):
    verify_data(args)


def validate_stack(args, report_violation):
    verify_data(args)


def verify_data(args):
    expected = { "foo": "bar", "hello": "world" }
    actual = args.stack_tags
    for k, v in expected.items():
        assert k in actual, f"Missing key: {k}"
        assert actual[k] == v, f"Value mismatch for {k}: expected {v}, got {actual[k]}"

PolicyPack(
    name="stack-tags-policy",
    enforcement_level=EnforcementLevel.MANDATORY,
    policies=[
        ResourceValidationPolicy(
            name="stack-tags-resource-validation",
            description="Verifies stack tags during resource validation.",
            validate=validate_resource,
            remediate=remediate_resource,
        ),
        StackValidationPolicy(
            name="stack-tags-stack-validation",
            description="Verifies stack tags during stack validation.",
            validate=validate_stack,
        ),
    ],
)
