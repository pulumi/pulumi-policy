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

from typing import Callable, List

import pulumi_policy.proxy as proxy

class ProxyTests(unittest.TestCase):
    def assert_raises_unknown_value(self,
                                       c: Callable,
                                       expected_unknown_type_sentinel: str,
                                       expected_props: List[str]):
        with self.assertRaises(proxy.UnknownValueError) as cm:
            c()

        self.assertEqual(expected_props, cm.exception.props)
        self.assertEqual(expected_unknown_type_sentinel, cm.exception.unknown_type_sentinel)


    def test_returns_values_at_properties_that_are_not_unknown(self):
        self.assertEqual(proxy.unknown_checking_proxy({"foo": "bar"})["foo"], "bar")
        self.assertEqual(proxy.unknown_checking_proxy({"foo": 0})["foo"], 0)
        self.assertEqual(proxy.unknown_checking_proxy({"foo": True})["foo"], True)
        self.assertEqual(proxy.unknown_checking_proxy({"foo": False})["foo"], False)
        self.assertEqual(proxy.unknown_checking_proxy({"foo": {"bar": "baz"}})["foo"]["bar"], "baz")
        self.assertEqual(proxy.unknown_checking_proxy({"foo": ["bar"]})["foo"][0], "bar")
        self.assertEqual(proxy.unknown_checking_proxy({"foo": [0]})["foo"][0], 0)
        self.assertEqual(proxy.unknown_checking_proxy({"foo": [True]})["foo"][0], True)
        self.assertEqual(proxy.unknown_checking_proxy({"foo": [False]})["foo"][0], False)


    def test_raises_on_unknown_value(self):
        self.assert_raises_unknown_value(
            lambda: proxy.unknown_checking_proxy({"foo": proxy.UNKNOWN_BOOLEAN_VALUE})["foo"],
            proxy.UNKNOWN_BOOLEAN_VALUE,
            ["foo"])

        self.assert_raises_unknown_value(
            lambda: proxy.unknown_checking_proxy({"foo": proxy.UNKNOWN_NUMBER_VALUE})["foo"],
            proxy.UNKNOWN_NUMBER_VALUE,
            ["foo"])

        self.assert_raises_unknown_value(
            lambda: proxy.unknown_checking_proxy({"foo": proxy.UNKNOWN_STRING_VALUE})["foo"],
            proxy.UNKNOWN_STRING_VALUE,
            ["foo"])

        self.assert_raises_unknown_value(
            lambda: proxy.unknown_checking_proxy({"foo": proxy.UNKNOWN_ARRAY_VALUE})["foo"],
            proxy.UNKNOWN_ARRAY_VALUE,
            ["foo"])

        self.assert_raises_unknown_value(
            lambda: proxy.unknown_checking_proxy({"foo": proxy.UNKNOWN_ASSET_VALUE})["foo"],
            proxy.UNKNOWN_ASSET_VALUE,
            ["foo"])

        self.assert_raises_unknown_value(
            lambda: proxy.unknown_checking_proxy({"foo": proxy.UNKNOWN_ARCHIVE_VALUE})["foo"],
            proxy.UNKNOWN_ARCHIVE_VALUE,
            ["foo"])

        self.assert_raises_unknown_value(
            lambda: proxy.unknown_checking_proxy({"foo": proxy.UNKNOWN_OBJECT_VALUE})["foo"],
            proxy.UNKNOWN_OBJECT_VALUE,
            ["foo"])


    def test_raises_on_nested_unknown_value(self):
        self.assert_raises_unknown_value(
            lambda: proxy.unknown_checking_proxy({"foo": {"bar": proxy.UNKNOWN_BOOLEAN_VALUE}})["foo"]["bar"],
            proxy.UNKNOWN_BOOLEAN_VALUE,
            ["foo", "bar"])

        self.assert_raises_unknown_value(
            lambda: proxy.unknown_checking_proxy({"foo": [proxy.UNKNOWN_BOOLEAN_VALUE]})["foo"][0],
            proxy.UNKNOWN_BOOLEAN_VALUE,
            ["foo", "0"])

        def list_loop():
            props = proxy.unknown_checking_proxy({"foo": [True, proxy.UNKNOWN_BOOLEAN_VALUE, False]})
            count = 0
            for _ in props["foo"]:
                count += 1

        self.assert_raises_unknown_value(list_loop, proxy.UNKNOWN_BOOLEAN_VALUE, ["foo", "1"])

        def list_enum():
            props = proxy.unknown_checking_proxy({"foo": [True, proxy.UNKNOWN_BOOLEAN_VALUE, False]})
            count = 0
            for _, __ in enumerate(props["foo"]):
                count += 1

        self.assert_raises_unknown_value(list_enum, proxy.UNKNOWN_BOOLEAN_VALUE, ["foo", "1"])

        def dict_items():
            props = proxy.unknown_checking_proxy({"foo": {"a": True, "b": proxy.UNKNOWN_BOOLEAN_VALUE, "c": False}})
            count = 0
            for _ in props["foo"].items():
                count += 1

        self.assert_raises_unknown_value(dict_items, proxy.UNKNOWN_BOOLEAN_VALUE, ["foo", "b"])

        def dict_values():
            props = proxy.unknown_checking_proxy({"foo": {"a": True, "b": proxy.UNKNOWN_BOOLEAN_VALUE, "c": False}})
            count = 0
            for _ in props["foo"].values():
                count += 1

        self.assert_raises_unknown_value(dict_values, proxy.UNKNOWN_BOOLEAN_VALUE, ["foo", "b"])
