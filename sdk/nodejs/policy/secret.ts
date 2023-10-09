// Copyright 2016-2023, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Secret } from "./policy";
import { isSpecialProxy, getSpecialProxyTarget } from "./proxy";

/**
 * `secretsPreservingProxy` is a helper that takes an input and ensures any properties
 * that are secrets are (a) unwrapped to return raw values and (b) preserve secretness
 * upon writes. This ensures that secret values are preserved even if replaced.
 *
 * @param toProxy the object whose property accesses to proxy.
 */
export function secretsPreservingProxy<T>(toProxy: any): any {
    if (!(toProxy instanceof Object)) {
        return toProxy;
    }

    const isSecret = (target: any, p: string | number | symbol): any => {
        const value = target[p];
        if (value && value instanceof Secret) {
            return [value.value, true];
        }
        return [value, false];
    };

    return new Proxy(toProxy, {
        get: (target: any, p: keyof T): any=> {
            // Check for special symbols.
            if (p === isSpecialProxy) {
                return true;
            } else if (p === getSpecialProxyTarget) {
                return target;
            }

            // If it's a secret, pluck out the raw value.
            const [value, _] = isSecret(target, p);

            // And in either case, make sure to deeply apply this transformation.
            return secretsPreservingProxy(value);
        },
        set: (target: any, p: keyof T, value: any, receiver: any): boolean => {
            // First check if the existing value is a secret. If it is, make any new values secret too.
            const [_, secret] = isSecret(target, p);
            if (secret) {
                value = new Secret(value);
            }
            target[p] = value;
            return true;
        },
    });
}


