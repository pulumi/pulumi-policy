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

# pylint: disable=protected-access

import unittest

from pulumi_policy.policy import EnforcementLevel, _NormalizedConfigValue, _normalize_config

class ConfigTests(unittest.TestCase):
    def test_normalize_config(self):
        test_cases = [
            {
                "config": {},
                "expected": {},
            },
            {
                "config": {"policy": EnforcementLevel.ADVISORY},
                "expected": {"policy": _NormalizedConfigValue(EnforcementLevel.ADVISORY, None)},
            },
            {
                "config": {"policy": {"foo": "bar"}},
                "expected": {"policy": _NormalizedConfigValue(None, {"foo": "bar"})},
            },
            {
                "config": {"policy": {"enforcementLevel": EnforcementLevel.ADVISORY, "foo": "bar"}},
                "expected": {"policy": _NormalizedConfigValue(EnforcementLevel.ADVISORY, {"foo": "bar"})},
            },
            {
                "config": {"policy": {"enforcementLevel": EnforcementLevel.MANDATORY, "foo": "bar"}},
                "expected": {"policy": _NormalizedConfigValue(EnforcementLevel.MANDATORY, {"foo": "bar"})},
            },
            {
                "config": {"policy": {"enforcementLevel": EnforcementLevel.REMEDIATE, "foo": "bar"}},
                "expected": {"policy": _NormalizedConfigValue(EnforcementLevel.REMEDIATE, {"foo": "bar"})},
            },
        ]

        for test_case in test_cases:
            result = _normalize_config(test_case["config"])
            self.assertDictEqual(test_case["expected"], result)
