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

import unittest

from pulumi_policy.version import _get_sem_version

class VersionTests(unittest.TestCase):
    def test_version(self):
        tests = {
            "0.12.0": "v0.12.0",
            "0.12.0+dirty": "v0.12.0+dirty",
            "0.12.0rc1": "v0.12.0-rc.1",
            "0.12.0rc1+dirty": "v0.12.0-rc.1+dirty",
            "0.12.1.dev1524606809": "v0.12.1-dev.1524606809",
            "0.12.1.dev1524606809+dirty": "v0.12.1-dev.1524606809+dirty"
        }

        for key in tests:
            version = _get_sem_version(key)
            self.assertEqual(tests[key], version)
