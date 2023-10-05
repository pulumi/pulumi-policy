// Copyright 2016-2019, Pulumi Corporation.
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

/**
 * `unknownCheckingProxy` takes a set of resource inputs, and returns a wrapped version that
 * intercepts all property accesses to check if they are unknown, throwing an `UnknownValueError` if
 * so. For example, if the resource inputs contains a reference to an IP address that can't be known
 * until the resource has been initialized by the cloud provider, this value would be unknown during
 * `pulumi preview`, and only filled in during the update.
 *
 * @param toProxy resource inputs to create a proxy for
 * @internal
 */
export function unknownCheckingProxy<T>(toProxy: any): any {
    return proxyHelper(toProxy, []);
}

/**
 * `proxyHelper` is a helper for the `unknownCheckingProxy` function.
 * @param toProxy resource inputs to create a proxy for
 * @param propsAcc accumulates the property path, e.g., for `resc.foo.bar`, this would be `["foo","bar"]`
 * @internal
 */
function proxyHelper<T>(toProxy: any, propsAcc: (keyof T)[]): any {
    if (!(toProxy instanceof Object)) {
        return toProxy;
    }

    return new Proxy(toProxy, {
        get: (obj, prop: keyof T) => {
            if (prop === 'getOriginalTarget') {
                return () => obj;
            }
            const newProps = propsAcc.concat([prop]);
            const field = obj[prop];
            if (isUnknown(field)) {
                throw new UnknownValueError<T>(field, newProps);
            }
            return proxyHelper(field, newProps);
        },
    });
}

/**
 * UnknownValueError indicates that a property we attempted to access in some cloud resource is
 * unknown. For example, during preview, some resource fields (such as an allocated IP address)
 * can't be known until the update is executed; an attempt to access such a field will result in
 * this exception.
 * @internal
 */
export class UnknownValueError<T> extends Error {
    public readonly unknownTypeSentinel: string;
    public readonly props: (keyof T)[];

    constructor(unknownTypeSentinel: string, props: (keyof T)[]) {
        const path = props.join(".");
        const unknownType = unknownToString(unknownTypeSentinel);
        super(`${unknownType} value at .${path} can't be known during preview`);
        this.unknownTypeSentinel = unknownTypeSentinel;
        this.props = props;
    }
}

function isUnknown(o: any): boolean {
    return (
        o === unknownBooleanValue ||
        o === unknownNumberValue ||
        o === unknownStringValue ||
        o === unknownArrayValue ||
        o === unknownAssetValue ||
        o === unknownArchiveValue ||
        o === unknownObjectValue
    );
}

function unknownToString(o: string): string {
    switch (o) {
        case unknownBooleanValue:
            return "boolean";
        case unknownNumberValue:
            return "number";
        case unknownStringValue:
            return "string";
        case unknownArrayValue:
            return "Array";
        case unknownAssetValue:
            return "asset";
        case unknownArchiveValue:
            return "archive";
        case unknownObjectValue:
            return "Object";
        default:
            throw new Error(`unknown value not recognized: ${o}`);
    }
}

// unknownBooleanValue is a sentinel indicating that a boolean property's value is not known,
// because it depends on a computation with values whose values themselves are not yet known (e.g.,
// dependent upon an output property).
/** @internal */
export const unknownBooleanValue = "1c4a061d-8072-4f0a-a4cb-0ff528b18fe7";
// unknownNumberValue is a sentinel indicating that a number property's value is not known, because
// it depends on a computation with values whose values themselves are not yet known (e.g.,
// dependent upon an output property).
/** @internal */
export const unknownNumberValue = "3eeb2bf0-c639-47a8-9e75-3b44932eb421";
// unknownStringValue is a sentinel indicating that a string property's value is not known, because
// it depends on a computation with values whose values themselves are not yet known (e.g.,
// dependent upon an output property).
/** @internal */
export const unknownStringValue = "04da6b54-80e4-46f7-96ec-b56ff0331ba9";
// unknownArrayValue is a sentinel indicating that an array property's value is not known, because
// it depends on a computation with values whose values themselves are not yet known (e.g.,
// dependent upon an output property).
/** @internal */
export const unknownArrayValue = "6a19a0b0-7e62-4c92-b797-7f8e31da9cc2";
// unknownAssetValue is a sentinel indicating that an asset property's value is not known, because
// it depends on a computation with values whose values themselves are not yet known (e.g.,
// dependent upon an output property).
/** @internal */
export const unknownAssetValue = "030794c1-ac77-496b-92df-f27374a8bd58";
// unknownArchiveValue is a sentinel indicating that an archive property's value is not known,
// because it depends on a computation with values whose values themselves are not yet known (e.g.,
// dependent upon an output property).
/** @internal */
export const unknownArchiveValue = "e48ece36-62e2-4504-bad9-02848725956a";
// unknownObjectValue is a sentinel indicating that an archive property's value is not known,
// because it depends on a computation with values whose values themselves are not yet known (e.g.,
// dependent upon an output property).
/** @internal */
export const unknownObjectValue = "dd056dcd-154b-4c76-9bd3-c8f88648b5ff";
