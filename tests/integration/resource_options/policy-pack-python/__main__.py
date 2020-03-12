# Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

from pulumi import Config, get_project, get_stack

from pulumi_policy import (
    EnforcementLevel,
    PolicyCustomTimeouts,
    PolicyPack,
    PolicyResourceOptions,
    ResourceValidationPolicy,
    StackValidationPolicy,
)


def create_urn(type_: str, name: str) -> str:
    return f"urn:pulumi:{get_stack()}::{get_project()}::{type_}::{name}"


def validate_resource(args, report_violation):
    validate(args)


def validate_stack(args, report_violation):
    for r in args.resources:
        validate(r)


def validate(r):
    config = Config()
    test_scenario = config.require_int("scenario")

    # We only validate during the first test scenario. The subsequent test scenario is only
    # used to unprotect protected resources in preparation for destroying the stack.
    if test_scenario != 1:
        return

    t = r.resource_type
    if (t == "pulumi:pulumi:Stack" or
            t == "pulumi:providers:pulumi-nodejs" or
            t == "pulumi:providers:random"):
        assert options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 0),
        ), r.opts)
    elif t == "pulumi-nodejs:dynamic:Resource":
        validate_dynamic_resource(r)
    elif t == "random:index/randomUuid:RandomUuid":
        assert options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 0),
        ), r.opts)
    else:
        raise AssertionError(f"Unexpected resource of type: '{t}'.")


def validate_dynamic_resource(r):
    if r.name == "empty" or r.name == "parent" or r.name == "a":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 0),
        ), r.opts)
    elif r.name == "protect":
        options_equal(PolicyResourceOptions(
            protect=True,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 0),
        ), r.opts)
    elif r.name == "ignoreChanges":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=["foo", "bar"],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 0),
        ), r.opts)
    elif r.name == "deleteBeforeReplaceNotSet":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 0),
        ), r.opts)
    elif r.name == "deleteBeforeReplaceTrue":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=True,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 0),
        ), r.opts)
    elif r.name == "deleteBeforeReplaceFalse":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=False,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 0),
        ), r.opts)
    elif r.name == "aliased":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[create_urn("pulumi-nodejs:dynamic:Resource", "old-name-for-aliased")],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 0),
        ), r.opts)
    elif r.name == "timeouts":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(60, 120, 180),
        ), r.opts)
    elif r.name == "timeouts-create":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(240, 0, 0),
        ), r.opts)
    elif r.name == "timeouts-update":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 300, 0),
        ), r.opts)
    elif r.name == "timeouts-delete":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=[],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 360),
        ), r.opts)
    elif r.name == "secrets":
        options_equal(PolicyResourceOptions(
            protect=False,
            ignore_changes=[],
            delete_before_replace=None,
            aliases=[],
            additional_secret_outputs=["foo"],
            custom_timeouts=PolicyCustomTimeouts(0, 0, 0),
        ), r.opts)
    else:
        raise AssertionError(f"Unexpected resource with name: '{r.name}'.")


def options_equal(expected: PolicyResourceOptions, actual: PolicyResourceOptions) -> bool:
    return (expected.protect == actual.protect and
            expected.ignore_changes == actual.ignore_changes and
            expected.delete_before_replace == actual.delete_before_replace and
            expected.aliases == actual.aliases and
            expected.custom_timeouts.create_seconds == actual.custom_timeouts.create_seconds and
            expected.custom_timeouts.update_seconds == actual.custom_timeouts.update_seconds and
            expected.custom_timeouts.delete_seconds == actual.custom_timeouts.delete_seconds and
            expected.additional_secret_outputs == actual.additional_secret_outputs)


PolicyPack(
    name="resource-options-test-policy",
    enforcement_level=EnforcementLevel.MANDATORY,
    policies=[
        ResourceValidationPolicy(
            name="validate-resource",
            description="Validates resource options during `validateResource`.",
            validate=validate_resource,
        ),
        StackValidationPolicy(
            name="validate-stack",
            description="Validates resource options during `validateStack`.",
            validate=validate_stack,
        ),
    ],
)
