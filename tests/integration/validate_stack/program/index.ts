// Copyright 2016-2019, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { Resource } from "./resource";

const config = new pulumi.Config();
const testScenario = config.getNumber("scenario");

switch (testScenario) {
    case 1:
        // Don't create any resources.
        break;

    case 2:
        // Create a resource that doesn't violate any policies.
        const hello = new Resource("hello", { hello: "world" });
        break;

    case 3:
        // Violates the first policy.
        const a = new Resource("a", { state: 1 });
        break;

    case 4:
        // Violates the second policy.
        const b = new Resource("b", { state: 2 });
        break;

    case 5:
        // Violates the third policy.
        const c = new Resource("c", { state: 3 });
        break;

    case 6:
        // Violates the fourth policy.
        const r1 = new random.RandomUuid("r1");
        break;

    case 7:
        // Violates the fifth policy.
        const r2 = new random.RandomString("r2", {
            length: 10,
        });
        break;

    case 8:
        // Create a resource to test the strongly-typed helpers.
        const r3 = new random.RandomPassword("r3", {
            length: 42,
        });
        break;

    case 9:
        // Create several resources of the same type to validate
        // resource filtering by type.
        const x = new random.RandomInteger("x", { min: 0, max: 10 });
        const y = new random.RandomInteger("y", { min: 0, max: 10 });
        const z = new random.RandomInteger("z", { min: 0, max: 10 });
        break;

    case 10:
        // Create a resource that will cause a stack policy with an
        // enforcement level of "remediate" to report a violation
        // successfully. It should be treated as "mandatory" rather
        // than "remediate".
        const d = new Resource("d", { foo: "bar" });
        break;
}
