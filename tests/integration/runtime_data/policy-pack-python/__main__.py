# Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import json
import os

from pulumi import Config, get_project, get_stack
from pulumi.runtime import is_dry_run
from pulumi.runtime.config import CONFIG
from pulumi_aws import config as aws_config

from pulumi_policy import (
    EnforcementLevel,
    PolicyPack,
    ResourceValidationPolicy,
    StackValidationPolicy,
)


def validate_resource(args, report_violation):
    verify_data(args)


def validate_stack(args, report_violation):
    for r in args.resources:
        verify_data(r)


def verify_data(r):
    t = r.resource_type
    if t != "pulumi-nodejs:dynamic:Resource":
        return

    # Verify is_dry_run()
    assert is_dry_run() == r.props["isDryRun"]

    # Verify get_project()
    assert "PULUMI_TEST_PROJECT" in os.environ
    assert get_project() == os.environ["PULUMI_TEST_PROJECT"]
    assert get_project() == r.props["getProject"]

    # Verify get_stack()
    assert "PULUMI_TEST_STACK" in os.environ
    assert get_stack() == os.environ["PULUMI_TEST_STACK"]
    assert get_stack() == r.props["getStack"]

    # Verify Config
    assert json.dumps(CONFIG, sort_keys=True) == json.dumps(r.props["allConfig"], sort_keys=True)
    config = Config()
    value = config.require("aConfigValue")
    assert value == "this value is a value"
    assert aws_config.region == "us-west-2"


PolicyPack(
    name="runtime-data-policy",
    enforcement_level=EnforcementLevel.MANDATORY,
    policies=[
        ResourceValidationPolicy(
            name="runtime-data-resource-validation",
            description="Verifies runtime data during resource validation.",
            validate=validate_resource,
        ),
        StackValidationPolicy(
            name="runtime-data-stack-validation",
            description="Verifies runtime data during stack validation.",
            validate=validate_stack,
        ),
    ],
)
