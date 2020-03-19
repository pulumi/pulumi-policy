# Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

from pulumi_policy import (
    EnforcementLevel,
    PolicyPack,
    ReportViolation,
    ResourceValidationArgs,
    ResourceValidationPolicy,
)

def randomuuid_no_keepers_validator(args: ResourceValidationArgs, report_violation: ReportViolation):
    if args.resource_type == "random:index/randomUuid:RandomUuid":
        if "keepers" not in args.props or not args.props["keepers"]:
            report_violation("RandomUuid must not have an empty 'keepers'.")


randomuuid_no_keepers = ResourceValidationPolicy(
    name="randomuuid-no-keepers",
    description="Prohibits creating a RandomUuid without any 'keepers'.",
    validate=randomuuid_no_keepers_validator,
)

PolicyPack(
    name="validate-resource-test-policy",
    enforcement_level=EnforcementLevel.MANDATORY,
    policies=[randomuuid_no_keepers],
)
