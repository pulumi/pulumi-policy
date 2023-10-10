# Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

from pulumi import get_project, get_stack

from pulumi_policy import (
    EnforcementLevel,
    PolicyPack,
    ResourceValidationPolicy,
    StackValidationPolicy,
)


def create_urn(type_: str, name: str) -> str:
    return f"urn:pulumi:{get_stack()}::{get_project()}::{type_}::{name}"


def validate_resource(args, report_violation):
    validate(args)


def remediate(args):
    validate(args)


def validate_stack(args, report_violation):
    for r in args.resources:
        validate(r)


def validate(r):
    t = r.resource_type
    if (t == "pulumi:pulumi:Stack" or
            t == "pulumi:providers:pulumi-nodejs" or
            t == "pulumi:providers:random"):
        assert r.provider is None
    elif t == "pulumi-nodejs:dynamic:Resource":
        assert r.provider is not None
        assert r.provider.resource_type == "pulumi:providers:pulumi-nodejs"
        assert r.provider.name == "default"
        assert r.provider.urn == create_urn("pulumi:providers:pulumi-nodejs", "default")
        assert not r.provider.props
    elif t == "random:index/randomUuid:RandomUuid":
        assert r.provider is not None
        assert r.provider.resource_type == "pulumi:providers:random"
        assert r.provider.name == "default_4_0_0"
        assert r.provider.urn == create_urn("pulumi:providers:random", "default_4_0_0")
        assert r.provider.props
        assert r.provider.props["version"] == "4.0.0"
    elif t == "random:index/randomString:RandomString":
        assert r.provider is not None
        assert r.provider.resource_type == "pulumi:providers:random"
        assert r.provider.name == "my-provider"
        assert r.provider.urn == create_urn("pulumi:providers:random", "my-provider")
        assert r.provider.props
        assert r.provider.props["version"] == "4.0.0"
    else:
        raise AssertionError(f"Unexpected resource of type: '{t}'.")


PolicyPack(
    name="resource-options-test-policy",
    enforcement_level=EnforcementLevel.MANDATORY,
    policies=[
        ResourceValidationPolicy(
            name="validate-resource",
            description="Validates resource options during `validateResource`.",
            validate=validate_resource,
            remediate=remediate,
        ),
        StackValidationPolicy(
            name="validate-stack",
            description="Validates resource options during `validateStack`.",
            validate=validate_stack,
        ),
    ],
)
