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

from typing import Any, Dict, List

from collections.abc import Mapping, Sequence

# UNKNOWN_BOOLEAN_VALUE is a sentinel indicating that a boolean property's value is not known,
# because it depends on a computation with values whose values themselves are not yet known (e.g.,
# dependent upon an output property).
UNKNOWN_BOOLEAN_VALUE = "1c4a061d-8072-4f0a-a4cb-0ff528b18fe7"

# UNKNOWN_NUMBER_VALUE is a sentinel indicating that a number property's value is not known, because
# it depends on a computation with values whose values themselves are not yet known (e.g.,
# dependent upon an output property).
UNKNOWN_NUMBER_VALUE = "3eeb2bf0-c639-47a8-9e75-3b44932eb421"

# UNKNOWN_STRING_VALUE is a sentinel indicating that a string property's value is not known, because
# it depends on a computation with values whose values themselves are not yet known (e.g.,
# dependent upon an output property).
UNKNOWN_STRING_VALUE = "04da6b54-80e4-46f7-96ec-b56ff0331ba9"

# UNKNOWN_ARRAY_VALUE is a sentinel indicating that an array property's value is not known, because
# it depends on a computation with values whose values themselves are not yet known (e.g.,
# dependent upon an output property).
UNKNOWN_ARRAY_VALUE = "6a19a0b0-7e62-4c92-b797-7f8e31da9cc2"

# UNKNOWN_ASSET_VALUE is a sentinel indicating that an asset property's value is not known, because
# it depends on a computation with values whose values themselves are not yet known (e.g.,
# dependent upon an output property).
UNKNOWN_ASSET_VALUE = "030794c1-ac77-496b-92df-f27374a8bd58"

# UNKNOWN_ARCHIVE_VALUE is a sentinel indicating that an archive property's value is not known,
# because it depends on a computation with values whose values themselves are not yet known (e.g.,
# dependent upon an output property).
UNKNOWN_ARCHIVE_VALUE = "e48ece36-62e2-4504-bad9-02848725956a"

# UNKNOWN_OBJECT_VALUE is a sentinel indicating that an archive property's value is not known,
# because it depends on a computation with values whose values themselves are not yet known (e.g.,
# dependent upon an output property).
UNKNOWN_OBJECT_VALUE = "dd056dcd-154b-4c76-9bd3-c8f88648b5ff"


class UnknownValueError(Exception):
    """
    Exception raised to indicate that a property we attempted to access in some cloud resource is
    unknown. For example, during preview, some resource fields (such as an allocated IP address)
    can't be known until the update is executed; an attempt to access such a field will result in
    this exception.
    """

    def __init__(self, unknown_type_sentinel: str, props: List[str]):
        super().__init__()
        self.unknown_type_sentinel = unknown_type_sentinel
        self.props = props
        path = ".".join(props)
        unknown_type = _unknown_to_str(unknown_type_sentinel)
        self.message = f"{unknown_type} value at .{path} can't be known during preview"


def unknown_checking_proxy(props: Dict[str, Any]) -> Dict[str, Any]:
    """
    Takes a set of resource inputs, and returns a wrapped version that
    intercepts all property accesses to check if they are unknown, raising an `UnknownValueError` if
    so. For example, if the resource inputs contains a reference to an IP address that can't be known
    until the resource has been initialized by the cloud provider, this value would be unknown during
    `pulumi preview`, and only filled in during the update.
    """
    return _proxy_helper(props, [])


class _ListProxy(Sequence):
    def __init__(self, elems: List[Any], props_acc: List[str]):
        self.__elems = elems
        self.__props_acc = props_acc

    def __getitem__(self, key):
        return _raise_if_unknown(key, self.__elems[key], self.__props_acc)

    def __len__(self):
        return len(self.__elems)


class _DictProxy(Mapping):
    def __init__(self, d: Dict[str, Any], props_acc: List[str]):
        self.__map = d
        self.__props_acc = props_acc

    def __getitem__(self, key):
        return _raise_if_unknown(key, self.__map[key], self.__props_acc)

    def __len__(self):
        return self.__map.__len__()

    def __iter__(self):
        return iter(self.__map)


def _raise_if_unknown(key: Any, val: Any, props_acc: List[str]) -> Any:
    if _is_unknown(val):
        raise UnknownValueError(val, _append_prop(props_acc, key))
    return val


def _append_prop(props_acc: List[str], key: Any) -> List[str]:
    props = props_acc.copy()
    props.append(str(key))
    return props


def _proxy_helper(to_proxy: Any, props_acc: List[str]) -> Any:
    """
    Returns a wrapper "proxy" arround lists and dicts that raises
    `UnknownValueError` when accessing unknown values.
    """

    if isinstance(to_proxy, list):
        elems: List[Any] = []
        for i, e in enumerate(to_proxy):
            elems.append(_proxy_helper(e, _append_prop(props_acc, i)))
        return _ListProxy(elems, props_acc)
    if isinstance(to_proxy, dict):
        d: Dict[str, Any] = {}
        for key in to_proxy:
            d[key] = _proxy_helper(to_proxy[key], _append_prop(props_acc, key))
        return _DictProxy(d, props_acc)
    return to_proxy


def _is_unknown(o: Any) -> bool:
    return isinstance(o, str) and o in (UNKNOWN_BOOLEAN_VALUE,
                                        UNKNOWN_NUMBER_VALUE,
                                        UNKNOWN_STRING_VALUE,
                                        UNKNOWN_ARRAY_VALUE,
                                        UNKNOWN_ASSET_VALUE,
                                        UNKNOWN_ARCHIVE_VALUE,
                                        UNKNOWN_OBJECT_VALUE)


def _unknown_to_str(o: str) -> str:
    # These values aren't Python types, they're just descriptive names for the
    # unknown types and are the same names used in the Node.js implementation.
    if o == UNKNOWN_BOOLEAN_VALUE:
        return "boolean"
    if o == UNKNOWN_NUMBER_VALUE:
        return "number"
    if o == UNKNOWN_STRING_VALUE:
        return "string"
    if o == UNKNOWN_ARRAY_VALUE:
        return "Array"
    if o == UNKNOWN_ASSET_VALUE:
        return "asset"
    if o == UNKNOWN_ARCHIVE_VALUE:
        return "archive"
    if o == UNKNOWN_OBJECT_VALUE:
        return "Object"
    raise AssertionError(f"unknown value not recognized: {o}")
