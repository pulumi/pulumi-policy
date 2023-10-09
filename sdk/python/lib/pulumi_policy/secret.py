# Copyright 2016-2023, Pulumi Corporation.
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


class Secret:
    """
    Secret allows values to be marked as sensitive, such that the Pulumi engine will encrypt them
    as normal with Pulumi secrets upon seeing one returned from a remediation.
    """
    def __init__(self, value: Any):
        """
        :param Any value: The plaintext value to turn into a secret.
        """
        self.value = value


def secrets_preserving_proxy(to_proxy: Any) -> Any:
    """
    Proxies a set of resource inputs and ensures any properties that are secrets are (a) unwrapped
    to return raw values and (b) preserve seceretness upon writes. This ensures that secret values
    are preserved even if replaced.
    """
    if isinstance(to_proxy, list):
        return _ListSecretsProxy(to_proxy)
    if isinstance(to_proxy, dict):
        return _DictSecretsProxy(to_proxy)
    return to_proxy


class _ListSecretsProxy(Sequence):
    def __init__(self, target: List[Any]):
        self.__target = target

    def __getitem__(self, key):
        if key == "__target":
            return self.__target

        value = self.__target[key]
        if isinstance(value, Secret):
            value = value.value
        return secrets_preserving_proxy(value)

    def __setitem__(self, key, value):
        if key in self.__target:
            # If the prior value is a secret, maintain it on the new value also.
            if isinstance(self.__target[key], Secret):
                value = Secret(value)
        self.__target[key] = value

    def __len__(self):
        return len(self.__target)


class _DictSecretsProxy(Mapping):
    def __init__(self, target: Dict[str, Any]):
        self.__target = target

    def __getitem__(self, key):
        if key == "__target":
            return self.__target

        value = self.__target[key]
        if isinstance(value, Secret):
            value = value.value
        return secrets_preserving_proxy(value)

    def __setitem__(self, key, value):
        if key in self.__target:
            # If the prior value is a secret, maintain it on the new value also.
            if isinstance(self.__target[key], Secret):
                value = Secret(value)
        self.__target[key] = value

    def __len__(self):
        return self.__target.__len__()

    def __iter__(self):
        return iter(self.__target)
