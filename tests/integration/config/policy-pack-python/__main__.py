# Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import pulumi

from pulumi_policy import (
    EnforcementLevel,
    PolicyConfigSchema,
    PolicyPack,
    ResourceValidationPolicy,
    StackValidationPolicy,
)

schema = None
initial_config = None
verify = None

test_scenario = pulumi.Config().require_int("scenario")

if test_scenario == 1:
    # Test scenario 1: String from config.
    schema = PolicyConfigSchema(
        properties={
            "foo": {"type": "string"},
        },
    )
    def check(config):
        assert config["foo"] == "bar"
    verify = check
elif test_scenario == 2:
    # Test scenario 2: Default string value specified in schema used.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
                "default": "bar",
            },
        },
    )
    def check(config):
        assert config["foo"] == "bar"
    verify = check
elif test_scenario == 3:
    # Test scenario 3: Default number value specified in schema used.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "number",
                "default": 42,
            },
        },
    )
    def check(config):
        assert config["foo"] == 42
    verify = check
elif test_scenario == 4:
    # Test scenario 4: Specified config value overrides default value.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
                "default": "bar",
            },
        },
    )
    def check(config):
        assert config["foo"] == "overridden"
    verify = check
elif test_scenario == 5:
    # Test scenario 5: Default value specified in schema for required field used.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
                "default": "bar",
            },
        },
        required=["foo"],
    )
    def check(config):
        assert config["foo"] == "bar"
    verify = check
elif test_scenario == 6:
    # Test scenario 6: Required config property not set.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
            },
        },
        required=["foo"],
    )
elif test_scenario == 7:
    # Test scenario 7: Default value set to incorrect type.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
                "default": 1,
            },
        },
    )
elif test_scenario == 8:
    # Test scenario 8: Default value too long.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
                "maxLength": 3,
                "default": "this value is too long",
            },
        },
    )
elif test_scenario == 9:
    # Test scenario 9: Default value too short.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
                "minLength": 50,
                "default": "this value is too short",
            },
        },
    )
elif test_scenario == 10:
    # Test scenario 10: Default value set to invalid enum value.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
                "enum": ["bar", "baz"],
                "default": "blah",
            },
        },
    )
elif test_scenario == 11:
    # Test scenario 11: Default value set to invalid constant value.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "const": "bar",
                "default": "blah",
            },
        },
    )
elif test_scenario == 12:
    # Test scenario 12: Incorrect type.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
            },
        },
    )
elif test_scenario == 13:
    # Test scenario 13: Invalid enum value.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "enum": ["bar", "baz"],
            },
        },
    )
elif test_scenario == 14:
    # Test scenario 14: Invalid constant value.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "const": "bar",
            },
        },
    )
elif test_scenario == 15:
    # Test scenario 15: Invalid constant value.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
                "maxLength": 3,
            },
            "bar": {
                "type": "integer",
            },
        },
    )
elif test_scenario == 16:
    # Test scenario 16: Number (int) from config.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "number",
            },
        },
    )
    def check(config):
        assert config["foo"] == 42
    verify = check
elif test_scenario == 17:
    # Test scenario 17: Number (float) from config.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "number",
            },
        },
    )
    def check(config):
        assert config["foo"] == 3.14
    verify = check
elif test_scenario == 18:
    # Test scenario 18: Integer from config.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "integer",
            },
        },
    )
    def check(config):
        assert config["foo"] == 42
    verify = check
elif test_scenario == 19:
    # Test scenario 19: Boolean (true) from config.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "boolean",
            },
        },
    )
    def check(config):
        assert config["foo"] == True
    verify = check
elif test_scenario == 20:
    # Test scenario 20: Boolean (false) from config.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "boolean",
            },
        },
    )
    def check(config):
        assert config["foo"] == False
    verify = check
elif test_scenario == 21:
    # Test scenario 21: Object from config.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "object",
            },
        },
    )
    def check(config):
        assert isinstance(config["foo"], dict)
        assert config["foo"]["bar"] == "baz"
    verify = check
elif test_scenario == 22:
    # Test scenario 22: Array from config.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "array",
            },
        },
    )
    def check(config):
        assert isinstance(config["foo"], list)
        assert len(config["foo"]) == 3
        assert config["foo"][0] == "a"
        assert config["foo"][1] == "b"
        assert config["foo"][2] == "c"
    verify = check
elif test_scenario == 23:
    # Test scenario 23: Null from config.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "null",
            },
        },
    )
    def check(config):
        assert config["foo"] is None
    verify = check
elif test_scenario == 24:
    # Test scenario 24: Initial config.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
            },
        },
    )
    initial_config = {
        "resource-validation": {
            "foo": "hello world",
        },
        "stack-validation": {
            "foo": "hello world",
        },
    }
    def check(config):
        assert config["foo"] == "hello world"
    verify = check
elif test_scenario == 25:
    # Test scenario 25: Initial config overridden.
    schema = PolicyConfigSchema(
        properties={
            "foo": {
                "type": "string",
            },
        },
    )
    initial_config = {
        "resource-validation": {
            "foo": "hello world",
        },
        "stack-validation": {
            "foo": "hello world",
        },
    }
    def check(config):
        assert config["foo"] == "overridden"
    verify = check
else:
    raise AssertionError(f"Unexpected test_scenario {test_scenario}.")


def validate(args, report_violation):
    if verify is not None:
        verify(args.get_config())


PolicyPack(
    name="config-policy",
    enforcement_level=EnforcementLevel.MANDATORY,
    policies=[
        ResourceValidationPolicy(
            name="resource-validation",
            description="Verifies policy config during resource validation.",
            validate=validate,
            config_schema=schema,
        ),
        StackValidationPolicy(
            name="stack-validation",
            description="Verifies policy config during stack validation.",
            validate=validate,
            config_schema=schema,
        ),
    ],
    initial_config=initial_config,
)
