# Copyright 2016-2020, Pulumi Corporation.
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
    ReportViolation,
    ResourceValidationPolicy,
    StackValidationPolicy,
)

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
