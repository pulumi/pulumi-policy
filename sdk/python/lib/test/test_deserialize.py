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

from typing import Any, Callable

import pulumi
import pulumi_policy.deserialize as deserialize

class PolicyPackTests(unittest.TestCase):
    def test_deserialize_properties_raises_on_unknown_signature_keys(self):
        with self.assertRaises(AssertionError):
            deserialize.deserialize_properties({
                "foo": {
                    deserialize.SPECIAL_SIG_KEY: "foobar",
                },
            })

    def test_deserialize_properties_raises_on_unsupported_asset_values(self):
        with self.assertRaises(AssertionError):
            deserialize.deserialize_properties({
                "foo": {
                    deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ASSET_SIG,
                },
            })

    def test_deserialize_properties_raises_on_unsupported_archive_values(self):
        with self.assertRaises(AssertionError):
            deserialize.deserialize_properties({
                "foo": {
                    deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ARCHIVE_SIG,
                },
            })

    def test_deserialize_properties_raises_on_unsupported_secret_values(self):
        with self.assertRaises(AssertionError):
            deserialize.deserialize_properties({
                "foo": {
                    deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_SECRET_SIG,
                },
            })

    def test_unmarshalls_file_asset(self):
        file_asset_value = {
            deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ASSET_SIG,
            "path": "a/path",
        }

        def assertObj(obj):
            self.assertIsInstance(obj, pulumi.FileAsset)
            self.assertEqual(obj.path, "a/path")

        self.unmarshalls_fully(file_asset_value, assertObj)

    def test_unmarshalls_string_asset(self):
        string_asset_value = {
            deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ASSET_SIG,
            "text": "some text",
        }

        def assertObj(obj):
            self.assertIsInstance(obj, pulumi.StringAsset)
            self.assertEqual(obj.text, "some text")

        self.unmarshalls_fully(string_asset_value, assertObj)

    def test_unmarshalls_remote_asset(self):
        remote_asset_value = {
            deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ASSET_SIG,
            "uri": "https://pulumi.com/",
        }

        def assertObj(obj):
            self.assertIsInstance(obj, pulumi.RemoteAsset)
            self.assertEqual(obj.uri, "https://pulumi.com/")

        self.unmarshalls_fully(remote_asset_value, assertObj)

    def test_unmarshalls_file_archive(self):
        file_archive_value = {
            deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ARCHIVE_SIG,
            "path": "a/path",
        }

        def assertObj(obj):
            self.assertIsInstance(obj, pulumi.FileArchive)
            self.assertEqual(obj.path, "a/path")

        self.unmarshalls_fully(file_archive_value, assertObj)

    def test_unmarshalls_remote_archive(self):
        remote_archive_value = {
            deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ARCHIVE_SIG,
            "uri": "https://pulumi.com/",
        }

        def assertObj(obj):
            self.assertIsInstance(obj, pulumi.RemoteArchive)
            self.assertEqual(obj.uri, "https://pulumi.com/")

        self.unmarshalls_fully(remote_archive_value, assertObj)

    def test_unmarshalls_asset_archive(self):
        asset_archive_value = {
            deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ARCHIVE_SIG,
            "assets": {
                "file_asset": {
                    deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ASSET_SIG,
                    "path": "a/path",
                },
                "string_asset": {
                    deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ASSET_SIG,
                    "text": "some text",
                },
                "remote_asset": {
                    deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ASSET_SIG,
                    "uri": "https://pulumi.com/",
                },
                "file_archive": {
                    deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ARCHIVE_SIG,
                    "path": "a/path",
                },
                "remote_archive": {
                    deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_ARCHIVE_SIG,
                    "uri": "https://pulumi.com/",
                },
            },
        }

        def assertObj(obj):
            self.assertIsInstance(obj, pulumi.AssetArchive)
            self.assertIn("file_asset", obj.assets)
            self.assertIsInstance(obj.assets["file_asset"], pulumi.FileAsset)
            self.assertEqual(obj.assets["file_asset"].path, "a/path")
            self.assertIn("string_asset", obj.assets)
            self.assertIsInstance(obj.assets["string_asset"], pulumi.StringAsset)
            self.assertEqual(obj.assets["string_asset"].text, "some text")
            self.assertIn("remote_asset", obj.assets)
            self.assertIsInstance(obj.assets["remote_asset"], pulumi.RemoteAsset)
            self.assertEqual(obj.assets["remote_asset"].uri, "https://pulumi.com/")
            self.assertIn("file_archive", obj.assets)
            self.assertIsInstance(obj.assets["file_archive"], pulumi.FileArchive)
            self.assertEqual(obj.assets["file_archive"].path, "a/path")
            self.assertIn("remote_archive", obj.assets)
            self.assertIsInstance(obj.assets["remote_archive"], pulumi.RemoteArchive)
            self.assertEqual(obj.assets["remote_archive"].uri, "https://pulumi.com/")

        self.unmarshalls_fully(asset_archive_value, assertObj)

    def test_fully_unmarshalls_secrets(self):
        secret_value = {
            deserialize.SPECIAL_SIG_KEY: deserialize.SPECIAL_SECRET_SIG,
            "value": "a secret value",
        }

        def assertObj(obj):
            self.assertEqual(obj, "a secret value")

        self.unmarshalls_fully(secret_value, assertObj)

    def unmarshalls_fully(self, obj: Any, assertObj: Callable[[Any], None]):
        props = {
            "regular": "a normal value",
            "list": ["a normal value", "another value", obj],
            "map": {"regular": "a normal value", "obj": obj},
            "mapWithList": {
                "regular": "a normal value",
                "list": ["a normal value", obj],
            },
            "listWithMap": [
                {
                    "regular": "a normal value",
                    "obj": obj,
                },
            ],
        }

        result = deserialize.deserialize_properties(props)

        # Regular is returned as is.
        self.assertEqual(result["regular"], "a normal value")

        # One of the elements in the list was a special object.
        self.assertNotIn(deserialize.SPECIAL_SIG_KEY, result["list"])
        self.assertEqual(result["list"][0], "a normal value")
        self.assertEqual(result["list"][1], "another value")
        assertObj(result["list"][2])

        # One of the values of the map was a special object.
        self.assertNotIn(deserialize.SPECIAL_SIG_KEY, result["map"])
        self.assertEqual(result["map"]["regular"], "a normal value")
        assertObj(result["map"]["obj"])

        # The nested map had a special object in one of the values.
        self.assertNotIn(deserialize.SPECIAL_SIG_KEY, result["mapWithList"])
        self.assertEqual(result["mapWithList"]["regular"], "a normal value")
        self.assertEqual(result["mapWithList"]["list"][0], "a normal value")
        assertObj(result["mapWithList"]["list"][1])

        # An array element contained a special object (via a nested map).
        self.assertNotIn(deserialize.SPECIAL_SIG_KEY, result["listWithMap"])
        self.assertEqual(result["listWithMap"][0]["regular"], "a normal value")
        assertObj(result["listWithMap"][0]["obj"])
