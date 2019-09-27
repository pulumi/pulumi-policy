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

import { asset } from "@pulumi/pulumi";
import {
    specialArchiveSig,
    specialAssetSig,
    specialSecretSig,
    specialSigKey,
} from "@pulumi/pulumi/runtime/rpc";

/**
 * deserializeProperties fetches the raw outputs and deserializes them from a gRPC call result.
 */
export function deserializeProperties(outputsStruct: any): any {
    const props: any = {};
    const outputs: any = outputsStruct.toJavaScript();
    for (const k of Object.keys(outputs)) {
        // We treat properties with undefined values as if they do not exist.
        if (outputs[k] !== undefined) {
            props[k] = deserializeProperty(outputs[k]);
        }
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
function deserializeProperty(prop: any): any {
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
            prop = deserializeProperty(e);
            elems.push(unwrapRpcSecret(prop));
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
                            const a = deserializeProperty(prop["assets"][name]);
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
                    return deserializeProperty(prop["value"]);
                default:
                    throw new Error(
                        `Unrecognized signature '${sig}' when unmarshaling resource property`,
                    );
            }
        }

        const obj: any = {};
        for (const k of Object.keys(prop)) {
            const o = deserializeProperty(prop[k]);
            obj[k] = unwrapRpcSecret(o);
        }

        return obj;
    }
}

/**
 * isRpcSecret returns true if obj is a wrapped secret value (i.e. it's an object with the special
 * key set).
 */
function isRpcSecret(obj: any): boolean {
    return obj && obj[specialSigKey] === specialSecretSig;
}

/**
 * unwrapRpcSecret returns the underlying value for a secret, or the value itself if it was not a
 * secret.
 */
function unwrapRpcSecret(obj: any): any {
    if (!isRpcSecret(obj)) {
        return obj;
    }
    return obj.value;
}
