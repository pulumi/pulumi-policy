# Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

from typing import List, NamedTuple, Optional

from pulumi import Config

from pulumi_policy import (
    EnforcementLevel,
    PolicyPack,
    ResourceValidationPolicy,
    StackValidationPolicy,
)


class Scenario(NamedTuple):
    pack: Optional[EnforcementLevel]
    policy: Optional[EnforcementLevel]


# Build a set of scenarios to test
enforcement_levels = [EnforcementLevel.ADVISORY, EnforcementLevel.DISABLED, EnforcementLevel.MANDATORY, None]
scenarios: List[Scenario] = [{}]
for pack in enforcement_levels:
    for policy in enforcement_levels:
        scenarios.append(Scenario(pack, policy))


# Get the current scenario
config = Config()
test_scenario = config.require_int("scenario")
if test_scenario >= len(scenarios):
    raise AssertionError(f"Unexpected test_scenario {test_scenario}.")
scenario = scenarios[test_scenario]


# Generate a Policy Pack name for the scenario.
pack: str = scenario.pack.value if scenario.pack is not None else "none"
policy: str = f"-{scenario.policy.value}" if scenario.policy is not None else ""
policy_pack_name = f"enforcementlevel-{pack}{policy}-test-policy"


# Whether the validate function should raise an exception (to validate that it doesn't run).
validate_function_raises = (
    (scenario.pack == EnforcementLevel.DISABLED and
        (scenario.policy == EnforcementLevel.DISABLED or scenario.policy is None)) or
    scenario.policy == EnforcementLevel.DISABLED)


# Create a Policy Pack instance for the scenario.
def validate_resource(args, report_violation):
    if validate_function_raises:
        raise AssertionError("validate-resource should never be called.")
    report_violation("validate-resource-violation-message")


def validate_stack(args, report_violation):
    if validate_function_raises:
        raise AssertionError("validate-stack should never be called.")
    report_violation("validate-stack-violation-message")





PolicyPack(
    name=policy_pack_name,
    enforcement_level=scenario.pack,
    policies=[
        ResourceValidationPolicy(
            name="validate-resource",
            description="Always reports a resource violation.",
            enforcement_level=scenario.policy,
            validate=validate_resource,
        ),
        StackValidationPolicy(
            name="validate-stack",
            description="Always reports a stack violation.",
            enforcement_level=scenario.policy,
            validate=validate_stack,
        ),
    ],
)
