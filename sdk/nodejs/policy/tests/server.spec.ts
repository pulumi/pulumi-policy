// Copyright 2016-2025, Pulumi Corporation.
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

import { strict as assert } from "assert";

import * as structproto from "google-protobuf/google/protobuf/struct_pb";

import * as pulumi from "@pulumi/pulumi";
import * as analyzerproto from "@pulumi/pulumi/proto/analyzer_pb";

import {
    remediateResourceOfType,
    ReportViolationArgs,
    ResourceValidationPolicy,
    StackValidationPolicy,
    validateRemediateResourceOfType,
    validateResourceOfType,
    validateStackResourcesOfType,
} from "../policy";

import { makeAnalyzeRpcFun, makeAnalyzeStackRpcFun, makeRemediateRpcFun } from "../server";

import { asyncTest, runResourcePolicy, runResourceRemediation, runStackPolicy } from "./util";

class Foo extends pulumi.Resource {
    public static __pulumiType = "my:index:Foo";
    constructor(name: string, args: FooArgs) {
        super("my:index:Foo", name, false);
    }
}

interface FooArgs {
}

class Bar extends pulumi.Resource {
    constructor(name: string, args: BarArgs) {
        super("my:index:Bar", name, false);
    }

    public static isInstance(obj: any): obj is Bar {
        return obj?.__pulumiType === "my:index:Bar";
    }
}

interface BarArgs {
}

describe("makeAnalyzeRpcFun", () => {
    describe("validateResourceOfType", () => {
        it("skips not applicable resource with __pulumiType", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                validateResource: validateResourceOfType(Foo, (_, __, reportViolation) => {
                    assert.fail("should not be called");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:SomethingElse");

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(),
                "Policy only applies to resources of type 'my:index:Foo'");
        }));

        it("skips not applicable resource with isInstance", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                validateResource: validateResourceOfType(Bar, (_, __, reportViolation) => {
                    assert.fail("should not be called");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:SomethingElse");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(),
                "Policy only applies to 'Bar' resources");
        }));

        it("doesn't skip applicable resource with __pulumiType", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                validateResource: validateResourceOfType(Foo, (_, __, reportViolation) => {
                    reportViolation("expected violation for Foo");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 1);
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackname(), "test-pack");
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackversion(), "0.0.1");
            assert.equal(response!.getDiagnosticsList()[0].getPolicyname(), "test-policy");
            assert.equal(response!.getDiagnosticsList()[0].getMessage(), "A test policy.\nexpected violation for Foo");
            assert.equal(response!.getNotApplicableList().length, 0);
        }));

        it("doesn't skip applicable resource with isInstance", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                validateResource: validateResourceOfType(Bar, (_, __, reportViolation) => {
                    reportViolation("expected violation for Bar");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Bar");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 1);
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackname(), "test-pack");
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackversion(), "0.0.1");
            assert.equal(response!.getDiagnosticsList()[0].getPolicyname(), "test-policy");
            assert.equal(response!.getDiagnosticsList()[0].getMessage(), "A test policy.\nexpected violation for Bar");
            assert.equal(response!.getNotApplicableList().length, 0);
        }));

        it("custom notApplicable", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                validateResource: validateResourceOfType(Foo, (_, args, reportViolation) => {
                    args.notApplicable("just because");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(), "just because");
        }));
    });

    describe("validateRemediateResourceOfType", () => {
        it("skips not applicable resource with __pulumiType", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                ...validateRemediateResourceOfType(Foo, (_, __, reportViolation) => {
                    assert.fail("should not be called");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:SomethingElse");

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(),
                "Policy only applies to resources of type 'my:index:Foo'");
        }));

        it("skips not applicable resource with isInstance", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                ...validateRemediateResourceOfType(Bar, (_, __, reportViolation) => {
                    assert.fail("should not be called");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:SomethingElse");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(),
                "Policy only applies to 'Bar' resources");
        }));

        it("doesn't skip applicable resource with __pulumiType", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                ...validateRemediateResourceOfType(Foo, (_, __, reportViolation) => {
                    reportViolation("expected violation for Foo");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 1);
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackname(), "test-pack");
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackversion(), "0.0.1");
            assert.equal(response!.getDiagnosticsList()[0].getPolicyname(), "test-policy");
            assert.equal(response!.getDiagnosticsList()[0].getMessage(), "A test policy.\nexpected violation for Foo");
            assert.equal(response!.getNotApplicableList().length, 0);
        }));

        it("doesn't skip applicable resource with isInstance", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                ...validateRemediateResourceOfType(Bar, (_, __, reportViolation) => {
                    reportViolation("expected violation for Bar");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Bar");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 1);
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackname(), "test-pack");
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackversion(), "0.0.1");
            assert.equal(response!.getDiagnosticsList()[0].getPolicyname(), "test-policy");
            assert.equal(response!.getDiagnosticsList()[0].getMessage(), "A test policy.\nexpected violation for Bar");
            assert.equal(response!.getNotApplicableList().length, 0);
        }));

        it("custom notApplicable", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                ...validateRemediateResourceOfType(Foo, (_, args, reportViolation) => {
                    args.notApplicable("just because");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(), "just because");
        }));
    });

    describe("remediateResourceOfType", () => {
        it("resource policies without validateResource are not applicable", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                remediateResource: remediateResourceOfType(Foo, (_, __) => {
                    assert.fail("should not be called");
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(), "Policy does not implement validateResource");
        }));
    });

    describe("ReportViolation with object argument", () => {
        it("reports violation with object argument in resource validation", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "advisory",
                validateResource: validateResourceOfType(Foo, (_, __, reportViolation) => {
                    reportViolation({
                        message: "This is a dynamic policy violation",
                        urn: "urn:pulumi:stack::project::my:index:Foo::my-foo",
                        name: "dynamic-policy",
                        description: "This is a dynamic policy violation",
                        enforcementLevel: "mandatory",
                    } as ReportViolationArgs as any);
                }),
            };

            const analyze = makeAnalyzeRpcFun(
                "test-pack",
                "0.0.1",
                "advisory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");
            request.setUrn("urn:pulumi:stack::project::my:index:Foo::my-foo");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyze({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 1);
            const diagnostic = response!.getDiagnosticsList()[0];
            assert.equal(diagnostic.getPolicypackname(), "test-pack");
            assert.equal(diagnostic.getPolicypackversion(), "0.0.1");
            assert.equal(diagnostic.getPolicyname(), "dynamic-policy");
            assert.equal(diagnostic.getMessage(), "This is a dynamic policy violation");
            assert.equal(diagnostic.getUrn(), "urn:pulumi:stack::project::my:index:Foo::my-foo");
            assert.equal(diagnostic.getDescription(), "This is a dynamic policy violation");
            assert.equal(diagnostic.getEnforcementlevel(), analyzerproto.EnforcementLevel.MANDATORY);
        }));
    });
});

describe("makeRemediateRpcFun", () => {
    describe("remediateResourceOfType", () => {
        it("skips not applicable resource with __pulumiType", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                remediateResource: remediateResourceOfType(Foo, (_, __) => {
                    assert.fail("should not be called");
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:SomethingElse");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(),
                "Policy only applies to resources of type 'my:index:Foo'");
        }));

        it("skips not applicable resource with isInstance", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                remediateResource: remediateResourceOfType(Bar, (_, __) => {
                    assert.fail("should not be called");
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:SomethingElse");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(),
                "Policy only applies to 'Bar' resources");
        }));

        it("doesn't skip applicable resource with __pulumiType", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                remediateResource: remediateResourceOfType(Foo, (_, __) => {
                    return { "message": "hello" };
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 1);
            assert.equal(response!.getRemediationsList()[0].getPolicypackname(), "test-pack");
            assert.equal(response!.getRemediationsList()[0].getPolicypackversion(), "0.0.1");
            assert.equal(response!.getRemediationsList()[0].getPolicyname(), "test-policy");
            assert.deepEqual(response!.getRemediationsList()[0].getProperties()?.toJavaScript(), { message: "hello" });
            assert.equal(response!.getNotApplicableList().length, 0);
        }));

        it("doesn't skip applicable resource with isInstance", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                remediateResource: remediateResourceOfType(Bar, (_, __) => {
                    return { "message": "hello" };
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Bar");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 1);
            assert.equal(response!.getRemediationsList()[0].getPolicypackname(), "test-pack");
            assert.equal(response!.getRemediationsList()[0].getPolicypackversion(), "0.0.1");
            assert.equal(response!.getRemediationsList()[0].getPolicyname(), "test-policy");
            assert.deepEqual(response!.getRemediationsList()[0].getProperties()?.toJavaScript(), { message: "hello" });
            assert.equal(response!.getNotApplicableList().length, 0);
        }));

        it("custom notApplicable", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                remediateResource: remediateResourceOfType(Foo, (_, args) => {
                    args.notApplicable("just because");
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(), "just because");
        }));
    });

    describe("validateRemediateResourceOfType", () => {
        it("skips not applicable resource with __pulumiType", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                ...validateRemediateResourceOfType(Foo, (_, __, reportViolation) => {
                    assert.fail("should not be called");
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:SomethingElse");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(),
                "Policy only applies to resources of type 'my:index:Foo'");
        }));

        it("skips not applicable resource with isInstance", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                ...validateRemediateResourceOfType(Bar, (_, __, reportViolation) => {
                    assert.fail("should not be called");
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:SomethingElse");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(),
                "Policy only applies to 'Bar' resources");
        }));

        it("doesn't skip applicable resource with __pulumiType", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                ...validateRemediateResourceOfType(Foo, (_, __, reportViolation) => {
                    return { "message": "hello" };
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 1);
            assert.equal(response!.getRemediationsList()[0].getPolicypackname(), "test-pack");
            assert.equal(response!.getRemediationsList()[0].getPolicypackversion(), "0.0.1");
            assert.equal(response!.getRemediationsList()[0].getPolicyname(), "test-policy");
            assert.deepEqual(response!.getRemediationsList()[0].getProperties()?.toJavaScript(), { message: "hello" });
            assert.equal(response!.getNotApplicableList().length, 0);
        }));

        it("doesn't skip applicable resource with isInstance", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                ...validateRemediateResourceOfType(Bar, (_, __, reportViolation) => {
                    return { "message": "hello" };
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Bar");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 1);
            assert.equal(response!.getRemediationsList()[0].getPolicypackname(), "test-pack");
            assert.equal(response!.getRemediationsList()[0].getPolicypackversion(), "0.0.1");
            assert.equal(response!.getRemediationsList()[0].getPolicyname(), "test-policy");
            assert.deepEqual(response!.getRemediationsList()[0].getProperties()?.toJavaScript(), { message: "hello" });
            assert.equal(response!.getNotApplicableList().length, 0);
        }));

        it("custom notApplicable", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                ...validateRemediateResourceOfType(Foo, (_, args, reportViolation) => {
                    args.notApplicable("just because");
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(), "just because");
        }));
    });

    describe("validateResourceOfType", () => {
        it("resource policies without remediateResource are not applicable", asyncTest(async () => {
            const policy: ResourceValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "remediate",
                validateResource: validateResourceOfType(Foo, (_, args, reportViolation) => {
                    assert.fail("should not be called");
                }),
            };

            const remediate = makeRemediateRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const request = new analyzerproto.AnalyzeRequest();
            request.setType("my:index:Foo");
            request.setProperties(new structproto.Struct());
            request.setOptions(new analyzerproto.AnalyzerResourceOptions());

            let response: analyzerproto.RemediateResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.RemediateResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await remediate({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getRemediationsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(), "Policy does not implement remediateResource");
        }));
    });
});

describe("makeAnalyzeStackRpcFun", () => {
    describe("validateStackResourcesOfType", () => {
        it("skips not applicable resource with __pulumiType", asyncTest(async () => {
            const policy: StackValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                validateStack: validateStackResourcesOfType(Foo, (_, __, reportViolation) => {
                    assert.fail("should not be called");
                }),
            };

            const analyzeStack = makeAnalyzeStackRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const resource = new analyzerproto.AnalyzerResource();
            resource.setType("my:index:SomethingElse");

            const request = new analyzerproto.AnalyzeStackRequest();
            request.setResourcesList([resource]);

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyzeStack({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(),
                "Policy only applies to resources of type 'my:index:Foo'");
        }));

        it("skips not applicable resource with isInstance", asyncTest(async () => {
            const policy: StackValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                validateStack: validateStackResourcesOfType(Bar, (_, __, reportViolation) => {
                    assert.fail("should not be called");
                }),
            };

            const analyzeStack = makeAnalyzeStackRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const resource = new analyzerproto.AnalyzerResource();
            resource.setType("my:index:SomethingElse");
            resource.setProperties(new structproto.Struct());
            resource.setOptions(new analyzerproto.AnalyzerResourceOptions());

            const request = new analyzerproto.AnalyzeStackRequest();
            request.setResourcesList([resource]);

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyzeStack({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(),
                "Policy only applies to 'Bar' resources");
        }));

        it("doesn't skip applicable resource with __pulumiType", asyncTest(async () => {
            const policy: StackValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                validateStack: validateStackResourcesOfType(Foo, (_, __, reportViolation) => {
                    reportViolation("expected violation for Foo");
                }),
            };

            const analyzeStack = makeAnalyzeStackRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const resource = new analyzerproto.AnalyzerResource();
            resource.setType("my:index:Foo");
            resource.setProperties(new structproto.Struct());
            resource.setOptions(new analyzerproto.AnalyzerResourceOptions());

            const request = new analyzerproto.AnalyzeStackRequest();
            request.setResourcesList([resource]);

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyzeStack({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 1);
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackname(), "test-pack");
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackversion(), "0.0.1");
            assert.equal(response!.getDiagnosticsList()[0].getPolicyname(), "test-policy");
            assert.equal(response!.getDiagnosticsList()[0].getMessage(), "A test policy.\nexpected violation for Foo");
            assert.equal(response!.getNotApplicableList().length, 0);
        }));

        it("doesn't skip applicable resource with isInstance", asyncTest(async () => {
            const policy: StackValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                validateStack: validateStackResourcesOfType(Bar, (_, __, reportViolation) => {
                    reportViolation("expected violation for Bar");
                }),
            };

            const analyzeStack = makeAnalyzeStackRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const resource = new analyzerproto.AnalyzerResource();
            resource.setType("my:index:Bar");
            resource.setProperties(new structproto.Struct());
            resource.setOptions(new analyzerproto.AnalyzerResourceOptions());

            const request = new analyzerproto.AnalyzeStackRequest();
            request.setResourcesList([resource]);

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyzeStack({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 1);
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackname(), "test-pack");
            assert.equal(response!.getDiagnosticsList()[0].getPolicypackversion(), "0.0.1");
            assert.equal(response!.getDiagnosticsList()[0].getPolicyname(), "test-policy");
            assert.equal(response!.getDiagnosticsList()[0].getMessage(), "A test policy.\nexpected violation for Bar");
            assert.equal(response!.getNotApplicableList().length, 0);
        }));

        it("custom notApplicable", asyncTest(async () => {
            const policy: StackValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "mandatory",
                validateStack: validateStackResourcesOfType(Foo, (_, args, reportViolation) => {
                    args.notApplicable("just because");
                }),
            };

            const analyzeStack = makeAnalyzeStackRpcFun(
                "test-pack",
                "0.0.1",
                "mandatory",
                [policy],
            );

            const resource = new analyzerproto.AnalyzerResource();
            resource.setType("my:index:Foo");
            resource.setProperties(new structproto.Struct());
            resource.setOptions(new analyzerproto.AnalyzerResourceOptions());

            const request = new analyzerproto.AnalyzeStackRequest();
            request.setResourcesList([resource]);

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyzeStack({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 0);
            assert.equal(response!.getNotApplicableList().length, 1);
            assert.equal(response!.getNotApplicableList()[0].getPolicyName(), "test-policy");
            assert.equal(response!.getNotApplicableList()[0].getReason(), "just because");
        }));
    });

    describe("ReportViolation with object argument", () => {
        it("reports violation with object argument in stack validation", asyncTest(async () => {
            const policy: StackValidationPolicy = {
                name: "test-policy",
                description: "A test policy.",
                enforcementLevel: "advisory",
                validateStack: validateStackResourcesOfType(Foo, (_, __, reportViolation) => {
                    reportViolation({
                        message: "Stack policy violation with custom fields",
                        urn: "urn:pulumi:stack::project::my:index:Foo::my-foo",
                        name: "stack-dynamic-policy",
                        description: "Stack policy violation with custom fields",
                        enforcementLevel: "mandatory",
                    } as ReportViolationArgs as any);
                }),
            };

            const analyzeStack = makeAnalyzeStackRpcFun(
                "test-pack",
                "0.0.1",
                "advisory",
                [policy],
            );

            const resource = new analyzerproto.AnalyzerResource();
            resource.setType("my:index:Foo");
            resource.setUrn("urn:pulumi:stack::project::my:index:Foo::my-foo");
            resource.setProperties(new structproto.Struct());
            resource.setOptions(new analyzerproto.AnalyzerResourceOptions());

            const request = new analyzerproto.AnalyzeStackRequest();
            request.setResourcesList([resource]);

            let response: analyzerproto.AnalyzeResponse | undefined = undefined;
            const callback = (err?: Error, resp?: analyzerproto.AnalyzeResponse) => {
                assert.equal(err, undefined);
                response = resp;
            };

            await analyzeStack({ request }, callback);

            assert.notEqual(response, undefined);
            assert.equal(response!.getDiagnosticsList().length, 1);
            const diagnostic = response!.getDiagnosticsList()[0];
            assert.equal(diagnostic.getPolicypackname(), "test-pack");
            assert.equal(diagnostic.getPolicypackversion(), "0.0.1");
            assert.equal(diagnostic.getPolicyname(), "stack-dynamic-policy");
            assert.equal(diagnostic.getMessage(), "Stack policy violation with custom fields");
            assert.equal(diagnostic.getUrn(), "urn:pulumi:stack::project::my:index:Foo::my-foo");
            assert.equal(diagnostic.getDescription(), "Stack policy violation with custom fields");
            assert.equal(diagnostic.getEnforcementlevel(), analyzerproto.EnforcementLevel.MANDATORY);
        }));
    });
});
