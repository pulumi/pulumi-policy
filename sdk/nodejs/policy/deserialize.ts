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

import { asset, Output } from "@pulumi/pulumi";
import {
    specialArchiveSig,
    specialAssetSig,
    specialSecretSig,
    specialSigKey,
} from "@pulumi/pulumi/runtime/rpc";

import { Secret } from "./policy";
import { isSpecialProxy, getSpecialProxyTarget } from "./proxy";
import { secretsPreservingProxy } from "./secret";

/**
 * deserializeProperties fetches the raw outputs and deserializes them from a gRPC call result.
 * @internal
 */
export function deserializeProperties(outputsStruct: any, proxySecrets: boolean): any {
    let props: any = {};
    const outputs: any = outputsStruct.toJavaScript();
    for (const k of Object.keys(outputs)) {
        // We treat properties with undefined values as if they do not exist.
        if (outputs[k] !== undefined) {
            props[k] = deserializeProperty(outputs[k], proxySecrets);
        }
    }
    if (proxySecrets) {
        props = secretsPreservingProxy(props);
    }
    return props;
}

/**
 * deserializeProperty is partly based on, but not functionally or superficially identical to, the
 * deserialization code in `@pulumi/pulumi/runtime/rpc.ts`.
 *
 * Specifically, we explicitly do not want to be compatible with Output<T>. Policies interact with
 * raw JSON representations of resource definitions, so things like secrets must be "fully unpacked"
 * into plain-old-JSON that the policies can interact with as normal data. If things like secrets
 * are not unpacked, every field in every resource type would have to be type `T | Secret<T>`, which
 * would severely detract from usability.
 */
function deserializeProperty(prop: any, proxySecrets: boolean): any {
    if (prop === undefined) {
        throw new Error("unexpected undefined property value during deserialization");
    } else if (
        prop === null ||
        typeof prop === "boolean" ||
        typeof prop === "number" ||
        typeof prop === "string"
    ) {
        return prop;
    } else if (prop instanceof Array) {
        const elems: any[] = [];
        for (const e of prop) {
            elems.push(deserializeProperty(e, proxySecrets));
        }

        return elems;
    } else {
        // We need to recognize assets and archives specially, so we can produce the right runtime
        // objects.
        const sig: any = prop[specialSigKey];
        if (sig) {
            switch (sig) {
                case specialAssetSig:
                    if (prop["path"]) {
                        return new asset.FileAsset(<string>prop["path"]);
                    } else if (prop["text"]) {
                        return new asset.StringAsset(<string>prop["text"]);
                    } else if (prop["uri"]) {
                        return new asset.RemoteAsset(<string>prop["uri"]);
                    } else {
                        throw new Error(
                            "Invalid asset encountered when unmarshaling resource property",
                        );
                    }
                case specialArchiveSig:
                    if (prop["assets"]) {
                        const assets: asset.AssetMap = {};
                        for (const name of Object.keys(prop["assets"])) {
                            const a = deserializeProperty(prop["assets"][name], proxySecrets);
                            if (!asset.Asset.isInstance(a) && !asset.Archive.isInstance(a)) {
                                throw new Error(
                                    "Expected an AssetArchive's assets to be unmarshaled Asset or Archive objects",
                                );
                            }
                            assets[name] = a;
                        }
                        return new asset.AssetArchive(assets);
                    } else if (prop["path"]) {
                        return new asset.FileArchive(<string>prop["path"]);
                    } else if (prop["uri"]) {
                        return new asset.RemoteArchive(<string>prop["uri"]);
                    } else {
                        throw new Error(
                            "Invalid archive encountered when unmarshaling resource property",
                        );
                    }
                case specialSecretSig:
                    let value = deserializeProperty(prop["value"], proxySecrets);
                    if (proxySecrets) {
                        // Wrap the value so that a proxy wrapper can detect it later on.
                        value = new Secret(value);
                    }
                    return value;
                default:
                    throw new Error(
                        `Unrecognized signature '${sig}' when unmarshaling resource property`,
                    );
            }
        }

        const obj: any = {};
        for (const k of Object.keys(prop)) {
            obj[k] = deserializeProperty(prop[k], proxySecrets);
        }

        return obj;
    }
}

/**
 * serializeProperties serializes a runtime resource object to ready it for a gRPC call result.
 * @internal
 */
export async function serializeProperties(obj: any): Promise<any> {
    return serializeProperty(obj);
}

/**
 * serializeProperty is partly based on, but not functionally or superficially identical to, the
 * serialization code in `@pulumi/pulumi/runtime/rpc.ts`. It has to handle the slightly different
 * serialization semantics for policies which treat outputs and secrets with different semantics.
 */
async function serializeProperty(prop: any): Promise<any> {
    if (prop === undefined) {
        return null;
    }
    if (prop === null ||
            typeof prop === "boolean" ||
            typeof prop === "number" ||
            typeof prop === "string") {
        return prop;
    }
    if (prop[isSpecialProxy]) {
        return await serializeProperty(prop[getSpecialProxyTarget]);
    }
    if (prop instanceof Promise) {
        return serializeProperty(await prop);
    }
    if (prop instanceof Array) {
        const elems: any[] = [];
        for (const e of prop) {
            const se = await serializeProperty(e);
            elems.push(se === undefined ? null : se);
        }
        return elems;
    }
    if (prop instanceof asset.FileAsset) {
        return { [specialSigKey]: specialAssetSig, path: await serializeProperty(prop.path) };
    }
    if (prop instanceof asset.StringAsset) {
        return { [specialSigKey]: specialAssetSig, text: await serializeProperty(prop.text) };
    }
    if (prop instanceof asset.RemoteAsset) {
        return { [specialSigKey]: specialAssetSig, uri: await serializeProperty(prop.uri) };
    }
    if (prop instanceof asset.AssetArchive) {
        const assets: any[] = [];
        for (const a of Object.keys(await prop.assets)) {
            assets.push(await serializeProperty(a));
        }
        return { [specialSigKey]: specialArchiveSig, assets };
    }
    if (prop instanceof asset.FileArchive) {
        return { [specialSigKey]: specialArchiveSig, path: await serializeProperty(prop.path) };
    }
    if (prop instanceof asset.RemoteArchive) {
        return { [specialSigKey]: specialArchiveSig, uri: await serializeProperty(prop.uri) };
    }
    if (prop instanceof Secret) {
        // Because of the way secrets proxying works, we very well may encounter a
        // secret in its raw form, since serialization explicitly unwraps the proxy and
        // accesses the raw underlying values.
        return {
            [specialSigKey]: specialSecretSig,
            value: await serializeProperty(prop.value),
        };
    }

    // Unsupported types:
    if (Output.isInstance(prop)) {
        throw new Error("Serializing output values not supported from within a policy pack");
    }

    const obj: any = {};
    for (const k of Object.keys(prop)) {
        const value = await serializeProperty(prop[k]);
        if (value !== undefined) {
            obj[k] = value;
        }
    }
    return obj;
}
