# Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

from pulumi_policy import (
    EnforcementLevel,
    PolicyPack,
    ReportViolation,
    StackValidationArgs,
    StackValidationPolicy,
)

def dynamic_no_state_with_value_1(args: StackValidationArgs, report_violation: ReportViolation):
    for r in args.resources:
        if r.resource_type == "pulumi-nodejs:dynamic:Resource":
            if "state" in r.props and r.props["state"] == 1:
                report_violation("'state' must not have the value 1.")

def dynamic_no_state_with_value_2(args: StackValidationArgs, report_violation: ReportViolation):
    for r in args.resources:
        if r.resource_type == "pulumi-nodejs:dynamic:Resource":
            if "state" in r.props and r.props["state"] == 2:
                report_violation("'state' must not have the value 2.")

def dynamic_no_state_with_value_3(args: StackValidationArgs, report_violation: ReportViolation):
    for r in args.resources:
        if r.resource_type == "pulumi-nodejs:dynamic:Resource":
            if "state" in r.props and r.props["state"] == 3:
                report_violation("'state' must not have the value 3.", r.urn)

# Note: In the NodeJS Policy Pack, this is a strongly-typed policy, but since Python
# does not yet support filtering by type, this is checking the type directly.
def randomuuid_no_keepers(args: StackValidationArgs, report_violation: ReportViolation):
    for r in args.resources:
        if r.resource_type == "random:index/randomUuid:RandomUuid":
            if "keepers" not in r.props or not r.props["keepers"]:
                report_violation("RandomUuid must not have an empty 'keepers'.")

# Note: In the NodeJS Policy Pack, this uses the `isType` helper.
def no_randomstrings(args: StackValidationArgs, report_violation: ReportViolation):
    for r in args.resources:
        if r.resource_type == "random:index/randomString:RandomString":
            report_violation("RandomString resources are not allowed.")

def dynamic_no_foo_with_value_bar(args: StackValidationArgs, report_violation: ReportViolation):
    for r in args.resources:
        if r.resource_type == "pulumi-nodejs:dynamic:Resource":
            if "foo" in r.props and r.props["foo"] == "bar":
                report_violation("'foo' must not have the value 'bar'.")

PolicyPack(
    name="validate-stack-test-policy",
    enforcement_level=EnforcementLevel.MANDATORY,
    policies=[
        StackValidationPolicy(
            name="dynamic-no-state-with-value-1",
            description="Prohibits setting state to 1 on dynamic resources.",
            validate=dynamic_no_state_with_value_1,
        ),
        # More than one policy.
        StackValidationPolicy(
            name="dynamic-no-state-with-value-2",
            description="Prohibits setting state to 2 on dynamic resources.",
            validate=dynamic_no_state_with_value_2,
        ),
        # Policy that specifies the URN of the resource violating the policy.
        StackValidationPolicy(
            name="dynamic-no-state-with-value-3",
            description="Prohibits setting state to 3 on dynamic resources.",
            validate=dynamic_no_state_with_value_3,
        ),
        StackValidationPolicy(
            name="randomuuid-no-keepers",
            description="Prohibits creating a RandomUuid without any 'keepers'.",
            validate=randomuuid_no_keepers,
        ),
        StackValidationPolicy(
            name="no-randomstrings",
            description="Prohibits RandomString resources.",
            validate=no_randomstrings,
        ),
        # Stack policies with an enforcement level of remediate are treated as mandatory.
        StackValidationPolicy(
            name="dynamic-no-foo-with-value-bar",
            description="Prohibits setting foo to 'bar' on dynamic resources.",
            enforcement_level=EnforcementLevel.REMEDIATE,
            validate=dynamic_no_foo_with_value_bar,
        ),
    ],
)
