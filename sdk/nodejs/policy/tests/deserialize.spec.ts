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

import * as assert from "assert";

import { Inputs, isSecret, runtime, secret } from "@pulumi/pulumi";
import { specialSecretSig, specialSigKey } from "@pulumi/pulumi/runtime/rpc";

import { deserializeProperties, serializeProperties } from "../deserialize";
import { Secret } from "../policy";
import { asyncTest } from "./util";

const gstruct = require("google-protobuf/google/protobuf/struct_pb.js");

async function runWithSerialization(inputs: Inputs, callback: (transfer: any) => void): Promise<void> {
    for (const usePolicySerialization of [false, true]) {
        let transfer: any | undefined = undefined;
        if (usePolicySerialization) {
            // Use the policy SDK's serialization to check round-tripping.
            transfer = gstruct.Struct.fromJavaScript(await serializeProperties(inputs));
        } else {
            // Use the runtime serialization as a check to ensure we are behaving consistently.
            transfer = gstruct.Struct.fromJavaScript(await runtime.serializeProperties("test", inputs));
        }

        // Run the callback with the serialized properties.
        callback(transfer);
    }
}

describe("runtime", () => {
    describe("deserializeProperties", () => {
        it(
            "marshals basic properties correctly",
            asyncTest(async () => {
                const inputs: Inputs = {
                    aNum: 42,
                    bStr: "a string",
                    cUnd: undefined,
                    dArr: Promise.resolve([
                        "x",
                        42,
                        Promise.resolve(true),
                        Promise.resolve(undefined),
                    ]),
                    id: "foo",
                    urn: "bar",
                };
                // Serialize and then deserialize all the properties, checking that they round-trip as expected.
                await runWithSerialization(inputs, (transfer: any) => {
                    const result = deserializeProperties(transfer, false);
                    assert.equal(result.aNum, 42);
                    assert.equal(result.bStr, "a string");
                    assert.equal(result.cUnd, undefined);
                    assert.deepEqual(result.dArr, ["x", 42, true, null]);
                    assert.equal(result.id, "foo");
                    assert.equal(result.urn, "bar");
                });
            }),
        );
        it(
            "marshals secrets correctly",
            asyncTest(async () => {
                const inputs: Inputs = {
                    secret1: secret(1),
                    secret2: secret(undefined),
                    secret3: {
                        "deeply": {
                            "nested": {
                                "secret": secret("youfoundme"),
                            },
                        },
                    },
                };
                // Serialize and then deserialize all the properties, checking that they round-trip as expected.
                const transfer = gstruct.Struct.fromJavaScript(await runtime.serializeProperties("test", inputs));
                const result = deserializeProperties(transfer, false);
                assert.equal(result.secret1, 1);
                assert.equal(result.secret2, undefined);
                assert.deepEqual(result.secret3, {
                    "deeply": {
                        "nested": {
                            "secret": "youfoundme",
                        },
                    },
                });
            }),
        );
        it(
            "marshals secrets correctly even when being proxied",
            asyncTest(async () => {
                const inputs: Inputs = {
                    secret1: secret(1),
                    secret2: secret(undefined),
                    secret3: {
                        "deeply": {
                            "nested": {
                                "secret": secret("youfoundme"),
                            },
                        },
                    },
                };
                // Serialize and then deserialize all the properties, checking that they round-trip as expected.
                const transfer = gstruct.Struct.fromJavaScript(await runtime.serializeProperties("test", inputs));
                const result = deserializeProperties(transfer, true);
                assert.equal(result.secret1, 1);
                assert.equal(result.secret2, undefined);
                assert.deepEqual(result.secret3, {
                    "deeply": {
                        "nested": {
                            "secret": "youfoundme",
                        },
                    },
                });
            }),
        );
    });

    describe("deserializeProperty", () => {
        it("fails on unsupported secret values", () => {
            assert.throws(() =>
                runtime.deserializeProperty({
                    [runtime.specialSigKey]: runtime.specialSecretSig,
                }),
            );
        });
        it("fails on unknown signature keys", () => {
            assert.throws(() =>
                runtime.deserializeProperty({
                    [runtime.specialSigKey]: "foobar",
                }),
            );
        });
        it("fully unmarshalls secrets (does not push secretness up)", () => {
            const secretValue = {
                [runtime.specialSigKey]: runtime.specialSecretSig,
                value: "a secret value",
            };

            const props = gstruct.Struct.fromJavaScript({
                regular: "a normal value",
                list: ["a normal value", "another value", secretValue],
                map: { regular: "a normal value", secret: secretValue },
                mapWithList: {
                    regular: "a normal value",
                    list: ["a normal value", secretValue],
                },
                listWithMap: [
                    {
                        regular: "a normal value",
                        secret: secretValue,
                    },
                ],
            });

            // Ensure this works the same regardless of whether secrets are proxied or not.
            for (const proxySecrets of [false, true]) {
                const result = deserializeProperties(props, proxySecrets);

                // Regular had no secrets in it, so it is returned as is.
                assert.equal(result.regular, "a normal value");

                // One of the elements in the list was a secret, so the secretness is promoted to top level.
                assert.equal(result.list[runtime.specialSigKey], undefined);
                assert.equal(result.list[0], "a normal value");
                assert.equal(result.list[1], "another value");
                assert.equal(result.list[2], "a secret value");

                // One of the values of the map was a secret, so the secretness is promoted to top level.
                assert.equal(result.map[runtime.specialSigKey], undefined);
                assert.equal(result.map.regular, "a normal value");
                assert.equal(result.map.secret, "a secret value");

                // The nested map had a secret in one of the values, so the entire thing becomes a secret.
                assert.equal(result.mapWithList[runtime.specialSigKey], undefined);
                assert.equal(result.mapWithList.regular, "a normal value");
                assert.equal(result.mapWithList.list[0], "a normal value");
                assert.equal(result.mapWithList.list[1], "a secret value");

                // An array element contained a secret (via a nested map), so the entrie array becomes a secret.
                assert.equal(result.listWithMap[runtime.specialSigKey], undefined);
                assert.equal(result.listWithMap[0].regular, "a normal value");
                assert.equal(result.listWithMap[0].secret, "a secret value");
            }
        });
    });

    describe("serializeProperties", () => {
        it(
            "marshals equivalently to the runtime",
            asyncTest(async () => {
                const inputs: Inputs = {
                    aNum: 42,
                    bStr: "a string",
                    cUnd: undefined,
                    dArr: Promise.resolve([
                        "x",
                        42,
                        Promise.resolve(true),
                        Promise.resolve(undefined),
                    ]),
                    id: "foo",
                    urn: "bar",
                };

                const policySer = gstruct.Struct.fromJavaScript(await serializeProperties(inputs));
                const runtimeSer = gstruct.Struct.fromJavaScript(await runtime.serializeProperties("test", inputs));
                assert.equal(policySer.aNum, runtimeSer.aNum);
                assert.equal(policySer.bStr, runtimeSer.bStr);
                assert.equal(policySer.cUnd, runtimeSer.cUnd);
                assert.deepEqual(policySer.dArr, runtimeSer.dArr);
                assert.equal(policySer.id, runtimeSer.id);
                assert.equal(policySer.urn, runtimeSer.urn);
            }),
        );
        it(
            "marshals secrets correctly",
            asyncTest(async () => {
                const makeInputs = (secretFunc: (v: any) => any) => ({
                    secret1: secretFunc(1),
                    secret2: secretFunc(undefined),
                    secret3: {
                        "deeply": {
                            "nested": {
                                "secret": secretFunc("youfoundme"),
                            },
                        },
                    },
                });

                // Policy inputs uses the policy version of a Secret marker:
                const policyInputs: Inputs = makeInputs((v: any) => new Secret(v));
                const policySer = gstruct.Struct.fromJavaScript(await serializeProperties(policyInputs));
                // While the runtime uses the normal Pulumi runtime version of a Secret marker:
                const runtimeInputs: Inputs = makeInputs((v: any) => secret(v));
                const runtimeSer = gstruct.Struct.fromJavaScript(await runtime.serializeProperties("test", runtimeInputs));

                // Both should lead to the same place.
                assert.deepEqual(policySer.secret1, runtimeSer.secret1);
                assert.deepEqual(policySer.secret2, runtimeSer.secret2);
                assert.deepEqual(policySer.secret3, runtimeSer.secret3);
            }),
        );
        it(
            "round-trips proxied secrets correctly",
            asyncTest(async () => {
                // Set mocks, which will enable secrets serialization.
                runtime.setMocks({
                    call: (_) => {
                        throw new Error("unexpected call");
                    },
                    newResource: (args) => {
                        return { id: `${args.name}_id`, state: {} };
                    },
                });

                // Start with a runtime representation of secrets.
                const inputs: Inputs = {
                    secret1: secret(1),
                    secret2: secret(undefined),
                    secret3: {
                        "deeply": {
                            "nested": {
                                "secret": secret("youfoundme"),
                            },
                        },
                    },
                };
                // Serialize using the runtime, deserialize (proxying secrets), re-serialize using the policy
                // serialization, and finally deserialize using runtime logic. This should preserve secretness.
                // This mimics the way a policy will work: it sends properties from its space, the policy engine
                // deserializes them, then a remediation can serialize new state, and finally the engine will
                // deserialize that state on its side.
                const runtimeSerialized = gstruct.Struct.fromJavaScript(
                    await runtime.serializeProperties("test", inputs));
                console.log(JSON.stringify(await runtime.serializeProperties("test", inputs), null, 4));
                const policyDeserializedAndProxied = deserializeProperties(runtimeSerialized, true);
                assert.equal(policyDeserializedAndProxied.secret1, 1);
                assert.equal(policyDeserializedAndProxied.secret2, undefined);
                assert.deepEqual(policyDeserializedAndProxied.secret3, {
                    "deeply": {
                        "nested": {
                            "secret": "youfoundme",
                        },
                    },
                });
                const policySerialized = gstruct.Struct.fromJavaScript(
                    await serializeProperties(policyDeserializedAndProxied));

                console.log(JSON.stringify(await serializeProperties(policyDeserializedAndProxied), null, 4));

                // The final result should include secrets.
                const runtimeDeserialized = runtime.deserializeProperties(policySerialized);
                console.log(JSON.stringify(runtimeDeserialized, null, 4));
                assert.deepEqual(runtimeDeserialized.secret1, {
                    [specialSigKey]: specialSecretSig,
                    "value": 1,
                });
                assert.deepEqual(runtimeDeserialized.secret2, {
                    [specialSigKey]: specialSecretSig,
                    "value": null,
                });
                assert.deepEqual(runtimeDeserialized.secret3, {
                    [specialSigKey]: specialSecretSig,
                    "value": {
                        "deeply": {
                            "nested": {
                                "secret": "youfoundme",
                            },
                        },
                    },
                });

            }),
        );
    });
});
