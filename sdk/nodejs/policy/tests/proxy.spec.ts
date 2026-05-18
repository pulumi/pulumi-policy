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

import {
    unknownArchiveValue,
    unknownArrayValue,
    unknownAssetValue,
    unknownBooleanValue,
    unknownCheckingProxy,
    unknownNumberValue,
    unknownObjectValue,
    unknownStringValue,
    UnknownValueError,
} from "../proxy";

function assertThrowsUnknownValue(f: Function, unknownTypeSentinel: string, path: string[]): void {
    try {
        f();
    } catch (e) {
        if (e instanceof UnknownValueError) {
            assert.strictEqual(e.unknownTypeSentinel, unknownTypeSentinel);
            assert.deepStrictEqual(e.props, path);
            return;
        }
        assert.fail(`threw something that is not an UnknownValueError: ${e}`);
    }
    assert.fail("didn't throw an error");
}

describe("proxy", () => {
    it("returns values at properties that are not unknown", () => {
        assert.strictEqual(unknownCheckingProxy({}).foo, undefined);
        assert.strictEqual(unknownCheckingProxy({ foo: "bar" }).foo, "bar");
        assert.strictEqual(unknownCheckingProxy({ foo: { bar: "baz" } }).foo.bar, "baz");

        assert.strictEqual(unknownCheckingProxy([]).foo, undefined);
        assert.strictEqual(unknownCheckingProxy([])[1], undefined);

        assert.strictEqual(unknownCheckingProxy(99).foo, undefined);
        assert.strictEqual(unknownCheckingProxy(99)[1], undefined);

        assert.strictEqual(unknownCheckingProxy("foo").foo, undefined);
        assert.strictEqual(unknownCheckingProxy("foo")[1], "o");

        assert.strictEqual(unknownCheckingProxy(undefined), undefined);
        assert.throws(() => unknownCheckingProxy(undefined).foo);
        assert.throws(() => unknownCheckingProxy(undefined)[1]);

        assert.strictEqual(unknownCheckingProxy(null), null);
        assert.throws(() => unknownCheckingProxy(null).foo);
        assert.throws(() => unknownCheckingProxy(null)[1]);
    });

    it("throws for properties that are unknown", () => {
        assertThrowsUnknownValue(
            () => {
                return unknownCheckingProxy({ foo: unknownBooleanValue }).foo;
            },
            unknownBooleanValue,
            ["foo"],
        );
        assertThrowsUnknownValue(
            () => {
                return unknownCheckingProxy({ foo: unknownNumberValue }).foo;
            },
            unknownNumberValue,
            ["foo"],
        );
        assertThrowsUnknownValue(
            () => {
                return unknownCheckingProxy({ foo: unknownStringValue }).foo;
            },
            unknownStringValue,
            ["foo"],
        );
        assertThrowsUnknownValue(
            () => {
                return unknownCheckingProxy({ foo: unknownArrayValue }).foo;
            },
            unknownArrayValue,
            ["foo"],
        );
        assertThrowsUnknownValue(
            () => {
                return unknownCheckingProxy({ foo: unknownAssetValue }).foo;
            },
            unknownAssetValue,
            ["foo"],
        );
        assertThrowsUnknownValue(
            () => {
                return unknownCheckingProxy({ foo: unknownArchiveValue }).foo;
            },
            unknownArchiveValue,
            ["foo"],
        );
        assertThrowsUnknownValue(
            () => {
                return unknownCheckingProxy({ foo: unknownObjectValue }).foo;
            },
            unknownObjectValue,
            ["foo"],
        );
    });

    it("throws for nested properties that are unknown", () => {
        assertThrowsUnknownValue(
            () => {
                return unknownCheckingProxy({ foo: { bar: unknownBooleanValue } }).foo.bar;
            },
            unknownBooleanValue,
            ["foo", "bar"],
        );
        assertThrowsUnknownValue(
            () => {
                return unknownCheckingProxy({ foo: [unknownBooleanValue] }).foo[0];
            },
            unknownBooleanValue,
            ["foo", "0"],
        );
        assertThrowsUnknownValue(
            () => {
                const props = unknownCheckingProxy({ foo: [true, unknownBooleanValue, false] });
                let count = 0;
                for (const item of props.foo) {
                    count++;
                }
            },
            unknownBooleanValue,
            ["foo", "1"],
        );
        assertThrowsUnknownValue(
            () => {
                const props = unknownCheckingProxy({ foo: [true, unknownBooleanValue, false] });
                let count = 0;
                props.foo.forEach(() => {
                    count++;
                });
            },
            unknownBooleanValue,
            ["foo", "1"],
        );
    });

    it("supports Array.prototype.filter on proxied arrays", () => {
        // Regression test: Array.prototype.filter internally uses ArraySpeciesCreate,
        // which looks up `.constructor[Symbol.species]` and then accesses `.prototype`
        // on the resulting (proxied) constructor. `Array.prototype` is a non-configurable,
        // non-writable data property; the Proxy invariant requires the get trap to
        // return the exact same value. Without the descriptor bypass in proxyHelper,
        // this throws a V8 TypeError.
        const props: any = unknownCheckingProxy({
            logs: [{ enabled: true }, { enabled: false }, { enabled: true }],
        });
        const enabled = props.logs.filter((l: any) => l.enabled);
        assert.strictEqual(enabled.length, 2);
    });

    it("supports Array.prototype.map on proxied arrays", () => {
        const props: any = unknownCheckingProxy({
            logs: [{ enabled: true }, { enabled: false }],
        });
        const flags = props.logs.map((l: any) => l.enabled);
        assert.deepStrictEqual(flags, [true, false]);
    });

    it("supports chained .filter().map() on proxied arrays", () => {
        const props: any = unknownCheckingProxy({
            logs: [
                { enabled: true, category: "AuditLogs" },
                { enabled: false, category: "RequestLogs" },
                { enabled: true, category: "GatewayLogs" },
            ],
        });
        const enabledCategories = props.logs
            .filter((l: any) => l.enabled)
            .map((l: any) => l.category);
        assert.deepStrictEqual(enabledCategories, ["AuditLogs", "GatewayLogs"]);
    });

    it("throws when .filter encounters an unknown array element", () => {
        // Sibling to the existing forEach test: the descriptor bypass must not
        // disable unknown-value detection during iteration. The first read of an
        // unknown element should still throw UnknownValueError with the correct path.
        assertThrowsUnknownValue(
            () => {
                const props: any = unknownCheckingProxy({ foo: [true, unknownBooleanValue, false] });
                return props.foo.filter((x: any) => x);
            },
            unknownBooleanValue,
            ["foo", "1"],
        );
    });

    it("throws when .map encounters an unknown array element", () => {
        assertThrowsUnknownValue(
            () => {
                const props: any = unknownCheckingProxy({ foo: [true, unknownBooleanValue, false] });
                return props.foo.map((x: any) => x);
            },
            unknownBooleanValue,
            ["foo", "1"],
        );
    });

    it("throws when .filter callback reads an unknown nested property", () => {
        // Array elements themselves are known objects, but a field inside one is unknown.
        // The callback's `.enabled` access on the proxied object must still throw.
        assertThrowsUnknownValue(
            () => {
                const props: any = unknownCheckingProxy({
                    logs: [
                        { enabled: true },
                        { enabled: unknownBooleanValue },
                        { enabled: false },
                    ],
                });
                return props.logs.filter((l: any) => l.enabled);
            },
            unknownBooleanValue,
            ["logs", "1", "enabled"],
        );
    });
});
