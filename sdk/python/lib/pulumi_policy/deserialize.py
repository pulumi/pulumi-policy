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

from typing import Any, Dict, List, Union

import pulumi

# SPECIAL_SIG_KEY is sometimes used to encode type identity inside of a map.
# See https://github.com/pulumi/pulumi/blob/master/sdk/go/common/resource/properties.go.
SPECIAL_SIG_KEY = "4dabf18193072939515e22adb298388d"

# SPECIAL_ASSET_SIG is a randomly assigned hash used to identify assets in maps.
# See https://github.com/pulumi/pulumi/blob/master/sdk/go/common/resource/properties.go.
SPECIAL_ASSET_SIG = "c44067f5952c0a294b673a41bacd8c17"

# SPECIAL_ARCHIVE_SIG is a randomly assigned hash used to identify archives in maps.
# See https://github.com/pulumi/pulumi/blob/master/sdk/go/common/resource/properties.go.
SPECIAL_ARCHIVE_SIG = "0def7320c3a5731c473e5ecbe6d01bc7"

# SPECIAL_SECRET_SIG is a randomly assigned hash used to identify secrets in maps.
# See https://github.com/pulumi/pulumi/blob/master/sdk/go/common/resource/properties.go.
SPECIAL_SECRET_SIG = "1b47061264138c4ac30d75fd1eb44270"

def deserialize_properties(props: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deserializes properties from a gRPC call result.
    """
    result: Dict[str, Any] = {}
    for key in props:
        result[key] = _deserialize_property(props[key])
    return result

def _deserialize_property(prop: Any) -> Any:
    if isinstance(prop, list):
        elems: List[Any] = []
        for e in prop:
            elems.append(_deserialize_property(e))
        return elems
    if isinstance(prop, dict):
        if SPECIAL_SIG_KEY in prop:
            sig = prop[SPECIAL_SIG_KEY]
            if sig == SPECIAL_ASSET_SIG:
                return _deserialize_asset(prop)
            if sig == SPECIAL_ARCHIVE_SIG:
                return _deserialize_archive(prop)
            if sig == SPECIAL_SECRET_SIG:
                if "value" not in prop:
                    raise AssertionError("Invalid secret encountered when unmarshaling resource property")
                return _deserialize_property(prop["value"])
            raise AssertionError(f"Unrecognized signature '{sig}' when unmarshaling resource property")
        return deserialize_properties(prop)
    return prop

def _deserialize_asset(prop: Dict[str, Any]) -> pulumi.Asset:
    if "path" in prop:
        return pulumi.FileAsset(prop["path"])
    if "text" in prop:
        return pulumi.StringAsset(prop["text"])
    if "uri" in prop:
        return pulumi.RemoteAsset(prop["uri"])
    raise AssertionError("Invalid asset encountered when unmarshaling resource property")

def _deserialize_archive(prop: Dict[str, Any]) -> pulumi.Archive:
    if "assets" in prop:
        assets: Dict[str, Union[pulumi.Asset, pulumi.Archive]] = {}
        for key in prop["assets"]:
            a = _deserialize_property(prop["assets"][key])
            if not isinstance(a, pulumi.Asset) and not isinstance(a, pulumi.Archive):
                raise AssertionError("Expected an AssetArchive's assets to be unmarshaled Asset or Archive objects")
            assets[key] = a
        return pulumi.AssetArchive(assets)
    if "path" in prop:
        return pulumi.FileArchive(prop["path"])
    if "uri" in prop:
        return pulumi.RemoteArchive(prop["uri"])
    raise AssertionError("Invalid archive encountered when unmarshaling resource property")
