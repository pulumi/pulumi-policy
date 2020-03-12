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

import pkg_resources

def _get_sem_version(package_version: str) -> str:
    if not package_version:
        return package_version

    dirty = ""
    if package_version.endswith("+dirty"):
        dirty = "+dirty"
        package_version = package_version[:-len("+dirty")]

    parts = package_version.split(".")

    if len(parts) == 4:
        dev = parts[3]
        if not dev.startswith("dev"):
            raise Exception("invalid package version")
        dev = dev[len("dev"):]
        return f"v{parts[0]}.{parts[1]}.{parts[2]}-dev.{dev}{dirty}"

    if len(parts) == 3:
        digits = ""
        on_suffix = False
        suffix = ""
        suffix_digits = ""
        for c in parts[2]:
            if c.isdigit() and not on_suffix:
                digits += c
            elif c.isdigit() and on_suffix:
                suffix_digits += c
            elif not c.isdigit():
                on_suffix = True
                suffix += c

        suffix = f"-{suffix}" if suffix else ""
        suffix_digits = f".{suffix_digits}" if suffix_digits else ""
        return f"v{parts[0]}.{parts[1]}.{digits}{suffix}{suffix_digits}{dirty}"

    raise Exception("invalid package version")

def _get_package_sem_version() -> str:
    version = pkg_resources.require("pulumi_policy")[0].version
    return _get_sem_version(version)
