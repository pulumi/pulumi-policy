# Copyright 2016-2025, Pulumi Corporation.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import asyncio
from inspect import isawaitable
from typing import Any, List, Mapping, Optional, Union
import unittest

from pulumi_policy import (
    EnforcementLevel,
    PolicyConfigSchema,
    PolicyPack,
    PolicyComplianceFramework,
    ReportViolation,
    ResourceValidationPolicy,
    Severity,
    StackValidationPolicy,
)
from pulumi_policy.policy import _PolicyAnalyzerServicer
from pulumi.runtime import proto

NOP = lambda: None
NOP_POLICY = ResourceValidationPolicy("nop", "nop", NOP)

def run_policy(policy: Union[ResourceValidationPolicy, StackValidationPolicy]) -> List[str]:
    violations = []
    def report(message: str, urn: Optional[str] = None):
        violations.append(message)

    result = policy.validate(None, report)
    if isawaitable(result):
        loop = asyncio.new_event_loop()
        task = asyncio.Task(result, loop=loop) if asyncio.iscoroutine(result) else result
        loop.run_until_complete(task)
        loop.close()

    return violations

def run_remediation(policy: ResourceValidationPolicy) -> Union[Mapping[str, Any], None]:
    result = policy.remediate(None)
    if isawaitable(result):
        loop = asyncio.new_event_loop()
        task = asyncio.Task(result, loop=loop)
        val = loop.run_until_complete(task)
        loop.close()
        return val

    return result

class PolicyPackTests(unittest.TestCase):
    def test_init_raises(self):
        self.assertRaises(TypeError, lambda: PolicyPack(None, [NOP_POLICY]))
        self.assertRaises(TypeError, lambda: PolicyPack("", [NOP_POLICY]))
        self.assertRaises(TypeError, lambda: PolicyPack(1, [NOP_POLICY]))
        self.assertRaises(TypeError, lambda: PolicyPack(("a" * 100) + "a", [NOP_POLICY]))
        self.assertRaises(TypeError, lambda: PolicyPack("*", [NOP_POLICY]))

        self.assertRaises(TypeError, lambda: PolicyPack("policies", None))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", ""))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", 1))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", []))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [None]))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [""]))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [1]))

        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], ""))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], 1))

        el = EnforcementLevel.ADVISORY
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], el, ""))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], el, 1))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], el, []))

        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], el, {1: 1}))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], el, {"p": None}))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], el, {"p": ""}))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], el, {"p": 1}))
        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], el, {"p": []}))

        self.assertRaises(TypeError, lambda: PolicyPack("policies", [NOP_POLICY], el, {"p": {1: 1}}))

class ResourceValidationPolicyTests(unittest.TestCase):
    def test_init_raises(self):
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy(None, "desc", NOP))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("", "desc", NOP))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy(1, "desc", NOP))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("all", "desc", NOP))

        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", None, NOP))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "", NOP))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", 1, NOP))

        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "desc"))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "desc", None))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "desc", ""))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "desc", 1))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "desc", []))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "desc", [None]))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "desc", [""]))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "desc", [1]))

        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "desc", NOP, ""))
        self.assertRaises(TypeError, lambda: ResourceValidationPolicy("name", "desc", NOP, 1))

    def test_init(self):
        ResourceValidationPolicy("name", "desc", NOP)
        ResourceValidationPolicy("name", "desc", [NOP])
        ResourceValidationPolicy("name", "desc", NOP, EnforcementLevel.ADVISORY)
        ResourceValidationPolicy("name", "desc", NOP, EnforcementLevel.MANDATORY)
        ResourceValidationPolicy("name", "desc", NOP, EnforcementLevel.REMEDIATE)
        ResourceValidationPolicy("name", "desc", NOP, EnforcementLevel.DISABLED)

    def test_async_validate(self):
        async def validate(args, report_violation: ReportViolation):
            report_violation("first")
            await asyncio.sleep(0.1)
            report_violation("second")

        policy = ResourceValidationPolicy("name", "desc", validate)
        violations = run_policy(policy)
        self.assertEqual(["first", "second"], violations)

    def test_multiple_async_validate(self):
        async def validate_one(args, report_violation: ReportViolation):
            report_violation("first")
            await asyncio.sleep(0.1)
            report_violation("second")

        async def validate_two(args, report_violation: ReportViolation):
            report_violation("third")
            await asyncio.sleep(0.1)
            report_violation("fourth")

        policy = ResourceValidationPolicy("name", "desc", [validate_one, validate_two])
        violations = run_policy(policy)
        self.assertCountEqual(["first", "second", "third", "fourth"], violations)

    def test_multiple_async_nonasync_mix_validate(self):
        async def validate_one(args, report_violation: ReportViolation):
            report_violation("first")
            await asyncio.sleep(0.1)
            report_violation("second")

        async def validate_two(args, report_violation: ReportViolation):
            report_violation("third")
            await asyncio.sleep(0.1)
            report_violation("fourth")

        def validate_three(args, report_violation: ReportViolation):
            report_violation("fifth")

        policy = ResourceValidationPolicy("name", "desc", [validate_one, validate_two, validate_three])
        violations = run_policy(policy)
        self.assertCountEqual(["first", "second", "third", "fourth", "fifth"], violations)


class ResourceValidationPolicySubclassNoValidateOverrideTests(unittest.TestCase):
    class Subclass(ResourceValidationPolicy):
        def __init__(self):
            super().__init__("name", "desc")

    def test_validate_raises(self):
        policy = self.Subclass()
        self.assertRaises(NotImplementedError, lambda: policy.validate(None, None))


class ResourceValidationPolicySubclassValidateOverrideTests(unittest.TestCase):
    class Subclass(ResourceValidationPolicy):
        def validate(self, args, report_violation):
            report_violation("first")
            report_violation("second")

        def __init__(self):
            super().__init__("name", "desc")

    def test_validate(self):
        policy = self.Subclass()
        violations = run_policy(policy)
        self.assertEqual(["first", "second"], violations)


class ResourceValidationPolicySubclassRemediateOverrideTests(unittest.TestCase):
    class Subclass(ResourceValidationPolicy):
        def remediate(self, args):
            return {"foo": "bar"}

        def __init__(self):
            super().__init__("name", "desc")

    def test_validate(self):
        policy = self.Subclass()
        remediation = run_remediation(policy)
        self.assertEqual({"foo": "bar"}, remediation)


class ResourceValidationPolicySubclassAsyncValidateTests(unittest.TestCase):
    class Subclass(ResourceValidationPolicy):
        async def validate(self, args, report_violation):
            report_violation("first")
            await asyncio.sleep(0.1)
            report_violation("second")

        def __init__(self):
            super().__init__("name", "desc")

    def test_validate(self):
        policy = self.Subclass()
        violations = run_policy(policy)
        self.assertEqual(["first", "second"], violations)


class ResourceValidationPolicySubclassAsyncRemediateTests(unittest.TestCase):
    class Subclass(ResourceValidationPolicy):
        async def remediate(self, args):
            await asyncio.sleep(0.1)
            return {"foo": "bar"}

        def __init__(self):
            super().__init__("name", "desc")

    def test_validate(self):
        policy = self.Subclass()
        remediation = run_remediation(policy)
        self.assertEqual({"foo": "bar"}, remediation)


class StackValidationPolicyTests(unittest.TestCase):
    def test_init_raises(self):
        self.assertRaises(TypeError, lambda: StackValidationPolicy(None, "desc", NOP))
        self.assertRaises(TypeError, lambda: StackValidationPolicy("", "desc", NOP))
        self.assertRaises(TypeError, lambda: StackValidationPolicy(1, "desc", NOP))
        self.assertRaises(TypeError, lambda: StackValidationPolicy("all", "desc", NOP))

        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", None, NOP))
        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", "", NOP))
        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", 1, NOP))

        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", "desc"))
        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", "desc", None))
        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", "desc", ""))
        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", "desc", 1))
        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", "desc", []))
        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", "desc", [NOP]))

        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", "desc", NOP, ""))
        self.assertRaises(TypeError, lambda: StackValidationPolicy("name", "desc", NOP, 1))

    def test_init(self):
        StackValidationPolicy("name", "desc", NOP)
        StackValidationPolicy("name", "desc", NOP, EnforcementLevel.ADVISORY)
        StackValidationPolicy("name", "desc", NOP, EnforcementLevel.MANDATORY)
        StackValidationPolicy("name", "desc", NOP, EnforcementLevel.DISABLED)

    def test_async_validate(self):
        async def validate(args, report_violation: ReportViolation):
            report_violation("first")
            await asyncio.sleep(0.1)
            report_violation("second")

        policy = StackValidationPolicy("name", "desc", validate)
        violations = run_policy(policy)
        self.assertEqual(["first", "second"], violations)


class StackValidationPolicySubclassNoValidateOverrideTests(unittest.TestCase):
    class Subclass(StackValidationPolicy):
        def __init__(self):
            super().__init__("name", "desc")

    def test_validate_raises(self):
        policy = self.Subclass()
        self.assertRaises(NotImplementedError, lambda: policy.validate(None, None))


class StackValidationPolicySubclassValidateOverrideTests(unittest.TestCase):
    class Subclass(StackValidationPolicy):
        def validate(self, args, report_violation):
            report_violation("first")
            report_violation("second")

        def __init__(self):
            super().__init__("name", "desc")

    def test_validate(self):
        policy = self.Subclass()
        violations = run_policy(policy)
        self.assertEqual(["first", "second"], violations)


class StackValidationPolicySubclassAsyncValidateTests(unittest.TestCase):
    class Subclass(StackValidationPolicy):
        async def validate(self, args, report_violation):
            report_violation("first")
            await asyncio.sleep(0.1)
            report_violation("second")

        def __init__(self):
            super().__init__("name", "desc")

    def test_validate(self):
        policy = self.Subclass()
        violations = run_policy(policy)
        self.assertEqual(["first", "second"], violations)


class PolicyConfigSchemaTests(unittest.TestCase):
    def test_init_raises(self):
        self.assertRaises(TypeError, lambda: PolicyConfigSchema(None))
        self.assertRaises(TypeError, lambda: PolicyConfigSchema(""))
        self.assertRaises(TypeError, lambda: PolicyConfigSchema(1))
        self.assertRaises(TypeError, lambda: PolicyConfigSchema([]))
        self.assertRaises(TypeError, lambda: PolicyConfigSchema({"enforcementLevel": {}}))

        self.assertRaises(TypeError, lambda: PolicyConfigSchema({}, ""))
        self.assertRaises(TypeError, lambda: PolicyConfigSchema({}, 1))
        self.assertRaises(TypeError, lambda: PolicyConfigSchema({}, [None]))
        self.assertRaises(TypeError, lambda: PolicyConfigSchema({}, [1]))
        self.assertRaises(TypeError, lambda: PolicyConfigSchema({}, ["enforcementLevel"]))

    def test_init(self):
        PolicyConfigSchema({})
        PolicyConfigSchema({"foo": {}})
        PolicyConfigSchema({"foo": {"type": "string"}})

        PolicyConfigSchema({}, [])
        PolicyConfigSchema({}, ["foo"])


class GetAnalyzerInfoTests(unittest.TestCase):
    def test_get_analyzer_info_basic(self):
        """Test GetAnalyzerInfo returns basic analyzer info"""
        policies = [ResourceValidationPolicy("test-policy", "Test policy description", NOP)]
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.MANDATORY
        )

        result = analyzer.GetAnalyzerInfo(None, None)

        self.assertEqual("test-pack", result.name)
        self.assertEqual("1.0.0", result.version)
        self.assertTrue(result.supportsConfig)
        self.assertEqual(1, len(result.policies))
        self.assertEqual("test-policy", result.policies[0].name)
        self.assertEqual("Test policy description", result.policies[0].description)
        self.assertEqual(proto.PolicyType.POLICY_TYPE_RESOURCE, result.policies[0].policy_type)

    def test_get_analyzer_info_with_optional_fields(self):
        """Test GetAnalyzerInfo with optional pack-level fields"""
        policies = [ResourceValidationPolicy("test-policy", "Test policy", NOP)]
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.ADVISORY,
            description="Test pack description",
            display_name="Test Pack Display Name",
            readme="Test README content",
            provider="test-provider",
            tags=["tag1", "tag2"],
            repository="https://github.com/test/repo"
        )

        result = analyzer.GetAnalyzerInfo(None, None)

        self.assertEqual("test-pack", result.name)
        self.assertEqual("1.0.0", result.version)
        self.assertTrue(result.supportsConfig)
        self.assertEqual("Test pack description", result.description)
        self.assertEqual("Test Pack Display Name", result.displayName)
        self.assertEqual("Test README content", result.readme)
        self.assertEqual("test-provider", result.provider)
        self.assertEqual(["tag1", "tag2"], list(result.tags))
        self.assertEqual("https://github.com/test/repo", result.repository)
        self.assertEqual(1, len(result.policies))
        self.assertEqual("test-policy", result.policies[0].name)
        self.assertEqual("Test policy", result.policies[0].description)
        self.assertEqual(proto.PolicyType.POLICY_TYPE_RESOURCE, result.policies[0].policy_type)

    def test_get_analyzer_info_with_initial_config(self):
        """Test GetAnalyzerInfo includes initial configuration"""
        policies = [ResourceValidationPolicy("test-policy", "Test policy", NOP)]
        initial_config = {
            "policy1": EnforcementLevel.MANDATORY,
            "policy2": {"prop1": "value1", "prop2": 42}
        }
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.ADVISORY,
            initial_config=initial_config
        )

        result = analyzer.GetAnalyzerInfo(None, None)

        self.assertIn("policy1", result.initialConfig)
        self.assertIn("policy2", result.initialConfig)
        self.assertEqual(proto.EnforcementLevel.MANDATORY, result.initialConfig["policy1"].enforcementLevel)
        self.assertIn("prop1", result.initialConfig["policy2"].properties)
        self.assertIn("prop2", result.initialConfig["policy2"].properties)

    def test_get_analyzer_info_multiple_policies(self):
        """Test GetAnalyzerInfo with multiple policies"""
        resource_policy = ResourceValidationPolicy(
            name="resource-policy",
            description="Resource policy description",
            validate=NOP,
            enforcement_level=EnforcementLevel.MANDATORY,
            display_name="Resource Policy Display",
            severity=Severity.HIGH,
            framework=PolicyComplianceFramework(
                name="SOC2",
                version="1.0",
                reference="ref-123",
                specification="spec-456"
            ),
            tags=["security", "compliance"],
            remediation_steps="Fix the resource",
            url="https://example.com/policy"
        )

        stack_policy = StackValidationPolicy(
            name="stack-policy",
            description="Stack policy description",
            validate=NOP,
            enforcement_level=EnforcementLevel.ADVISORY
        )

        policies = [resource_policy, stack_policy]
        analyzer = _PolicyAnalyzerServicer(
            name="multi-policy-pack",
            version="2.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.DISABLED
        )

        result = analyzer.GetAnalyzerInfo(None, None)

        self.assertEqual(len(result.policies), 2)

        # Check resource policy
        resource_policy_info = next(p for p in result.policies if p.name == "resource-policy")
        self.assertEqual("Resource policy description", resource_policy_info.description)
        self.assertEqual(proto.EnforcementLevel.MANDATORY, resource_policy_info.enforcementLevel)
        self.assertEqual("Resource Policy Display", resource_policy_info.displayName)
        self.assertEqual(proto.PolicyType.POLICY_TYPE_RESOURCE, resource_policy_info.policy_type)
        self.assertEqual(proto.PolicySeverity.POLICY_SEVERITY_HIGH, resource_policy_info.severity)
        self.assertEqual("SOC2", resource_policy_info.framework.name)
        self.assertEqual("1.0", resource_policy_info.framework.version)
        self.assertEqual("ref-123", resource_policy_info.framework.reference)
        self.assertEqual("spec-456", resource_policy_info.framework.specification)
        self.assertEqual(["security", "compliance"], list(resource_policy_info.tags))
        self.assertEqual("Fix the resource", resource_policy_info.remediation_steps)
        self.assertEqual("https://example.com/policy", resource_policy_info.url)

        # Check stack policy
        stack_policy_info = next(p for p in result.policies if p.name == "stack-policy")
        self.assertEqual("Stack policy description", stack_policy_info.description)
        self.assertEqual(proto.EnforcementLevel.ADVISORY, stack_policy_info.enforcementLevel)
        self.assertEqual(proto.PolicyType.POLICY_TYPE_STACK, stack_policy_info.policy_type)

    def test_get_analyzer_info_with_config_schema(self):
        """Test GetAnalyzerInfo includes policy config schema"""
        config_schema = PolicyConfigSchema(
            properties={
                "maxInstances": {"type": "integer", "minimum": 1},
                "environment": {"type": "string", "enum": ["dev", "prod"]}
            },
            required=["environment"]
        )

        policy = ResourceValidationPolicy(
            name="schema-policy",
            description="Policy with config schema",
            validate=NOP,
            config_schema=config_schema
        )

        analyzer = _PolicyAnalyzerServicer(
            name="schema-pack",
            version="1.0.0",
            policies=[policy],
            enforcement_level=EnforcementLevel.MANDATORY
        )

        result = analyzer.GetAnalyzerInfo(None, None)

        policy_info = result.policies[0]
        self.assertIn("maxInstances", policy_info.configSchema.properties)
        self.assertIn("environment", policy_info.configSchema.properties)
        self.assertEqual(list(policy_info.configSchema.required), ["environment"])

    def test_get_analyzer_info_empty_optional_fields(self):
        """Test GetAnalyzerInfo handles None values for optional fields correctly"""
        policy = ResourceValidationPolicy("test-policy", "Test policy", NOP)
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=[policy],
            enforcement_level=EnforcementLevel.MANDATORY,
            description=None,
            display_name=None,
            readme=None,
            provider=None,
            tags=None,
            repository=None
        )

        result = analyzer.GetAnalyzerInfo(None, None)

        # These fields should not be set when None
        self.assertEqual("", result.description)
        self.assertEqual("", result.displayName)
        self.assertEqual("", result.readme)
        self.assertEqual("", result.provider)
        self.assertEqual(0, len(result.tags))
        self.assertEqual("", result.repository)


class AnalyzeTests(unittest.TestCase):
    def test_analyze_not_applicable(self):
        async def validate(args, report_violation: ReportViolation):
            args.not_applicable("just because")

        policies = [ResourceValidationPolicy("test-policy", "Test policy description", validate)]
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.MANDATORY
        )

        request = proto.AnalyzeRequest()
        result = analyzer.Analyze(request, None)
        self.assertEqual(1, len(result.not_applicable))
        self.assertEqual("test-policy", result.not_applicable[0].policy_name)
        self.assertEqual("just because", result.not_applicable[0].reason)

    def test_analyze_only_remediate_not_applicable(self):
        async def remediate(args):
            return None

        policies = [ResourceValidationPolicy("test-policy", "Test policy description", remediate=remediate)]
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.MANDATORY
        )

        request = proto.AnalyzeRequest()
        result = analyzer.Analyze(request, None)
        self.assertEqual(1, len(result.not_applicable))
        self.assertEqual("test-policy", result.not_applicable[0].policy_name)
        self.assertEqual("Policy does not implement validate", result.not_applicable[0].reason)

    def test_analyze_severity_propagated(self):
        async def validate(args, report_violation: ReportViolation):
            report_violation("violation message")

        policies = [ResourceValidationPolicy("test-policy", "test policy description", validate,
                                             severity=Severity.MEDIUM)]
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.MANDATORY
        )

        request = proto.AnalyzeRequest()
        result = analyzer.Analyze(request, None)
        self.assertEqual(1, len(result.diagnostics))
        self.assertEqual("test-policy", result.diagnostics[0].policyName)
        self.assertEqual("test policy description\nviolation message", result.diagnostics[0].message)
        self.assertEqual(proto.PolicySeverity.POLICY_SEVERITY_MEDIUM, result.diagnostics[0].severity)


class RemediateTests(unittest.TestCase):
    def test_remediate_not_applicable(self):
        async def remediate(args):
            args.not_applicable("just because")

        policies = [ResourceValidationPolicy("test-policy", "Test policy description", remediate=remediate)]
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.REMEDIATE
        )

        request = proto.AnalyzeRequest()
        result = analyzer.Remediate(request, None)
        self.assertEqual(1, len(result.not_applicable))
        self.assertEqual("test-policy", result.not_applicable[0].policy_name)
        self.assertEqual("just because", result.not_applicable[0].reason)

    def test_remediate_only_analyze_not_applicable(self):
        async def validate(args, report_violation: ReportViolation):
            return None

        policies = [ResourceValidationPolicy("test-policy", "Test policy description", validate)]
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.REMEDIATE
        )

        request = proto.AnalyzeRequest()
        result = analyzer.Remediate(request, None)
        self.assertEqual(1, len(result.not_applicable))
        self.assertEqual("test-policy", result.not_applicable[0].policy_name)
        self.assertEqual("Policy does not implement remediate", result.not_applicable[0].reason)


class AnalyzeStackTests(unittest.TestCase):
    def test_analyze_stack_not_applicable(self):
        async def validate(args, report_violation: ReportViolation):
            args.not_applicable("just because")

        policies = [StackValidationPolicy("test-policy", "Test policy description", validate)]
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.MANDATORY
        )

        request = proto.AnalyzeStackRequest()
        result = analyzer.AnalyzeStack(request, None)
        self.assertEqual(1, len(result.not_applicable))
        self.assertEqual("test-policy", result.not_applicable[0].policy_name)
        self.assertEqual("just because", result.not_applicable[0].reason)

    def test_analyze_stack_severity_propagated(self):
        async def validate(args, report_violation: ReportViolation):
            report_violation("violation message")

        policies = [StackValidationPolicy("test-policy", "test policy description", validate,
                                          severity=Severity.LOW)]
        analyzer = _PolicyAnalyzerServicer(
            name="test-pack",
            version="1.0.0",
            policies=policies,
            enforcement_level=EnforcementLevel.MANDATORY
        )

        request = proto.AnalyzeStackRequest()
        result = analyzer.AnalyzeStack(request, None)
        self.assertEqual(1, len(result.diagnostics))
        self.assertEqual("test-policy", result.diagnostics[0].policyName)
        self.assertEqual("test policy description\nviolation message", result.diagnostics[0].message)
        self.assertEqual(proto.PolicySeverity.POLICY_SEVERITY_LOW, result.diagnostics[0].severity)
