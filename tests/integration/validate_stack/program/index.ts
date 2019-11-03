// Copyright 2016-2019, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";
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
}
