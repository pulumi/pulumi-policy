# Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import json

from pulumi_policy import (
    EnforcementLevel,
    PolicyPack,
    StackValidationPolicy,
)


def validate_stack(args, report_violation):
    for r in args.resources:
        validate(args.resources, r)


def validate(resources, r):
    stack = next(r for r in resources if r.resource_type == "pulumi:pulumi:Stack")

    t = r.resource_type
    if (t == "pulumi:pulumi:Stack" or
            t == "pulumi:providers:pulumi-nodejs" or
            t == "pulumi:providers:random"):
        assert r.parent is None
        assert json.dumps(r.dependencies) == json.dumps([])
        assert json.dumps(r.property_dependencies) == json.dumps({})
    elif t == "pulumi-nodejs:dynamic:Resource":
        if r.name == "child":
            parent = next(r for r in resources if r.name == "parent")
            assert r.parent is parent
            assert json.dumps(r.dependencies) == json.dumps([])
            assert json.dumps(r.property_dependencies) == json.dumps({})
        elif r.name == "b":
            assert r.parent is stack
            a = next(r for r in resources if r.name == "a")
            assert len(r.dependencies) == 1
            assert r.dependencies[0] is a
            assert json.dumps(r.property_dependencies) == json.dumps({})
    elif t == "random:index/randomString:RandomString":
        assert r.parent is stack
        assert json.dumps(r.dependencies) == json.dumps([])
        assert json.dumps(r.property_dependencies) == json.dumps({})
    elif t == "random:index/randomPet:RandomPet":
        assert r.parent is stack
        str_ = next(r for r in resources if r.name == "str")
        assert len(r.dependencies) == 1
        assert r.dependencies[0] is str_
        assert "prefix" in r.property_dependencies
        prefix = r.property_dependencies["prefix"]
        assert len(prefix) == 1
        assert prefix[0] is str_
    else:
        raise AssertionError(f"Unexpected resource of type: '{t}'.")

PolicyPack(
    name="parent-dependencies-test-policy",
    enforcement_level=EnforcementLevel.MANDATORY,
    policies=[
        StackValidationPolicy(
            name="validate-stack",
            description="Validates resource options during `validateStack`.",
            validate=validate_stack,
        ),
    ],
)
