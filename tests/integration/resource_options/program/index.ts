// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { Resource } from "./resource";

const config = new pulumi.Config();
const testScenario = config.requireNumber("scenario");

// Create a resource that doesn't have any explicit options set.
const empty = new Resource("empty");

// Create resources with a parent/child relationship.
const parent = new Resource("parent");
const child = new Resource("child", {
    parent: parent,
});

// Create a protected resource.
const protect = new Resource("protect", {
    // Only set `protect` during the first test scenario when the actual tests are run.
    // Set it to `false` on any other test scenario in preparation for destroying the stack.
    protect: testScenario === 1,
});

// Create resources with a dependency relationship.
const a = new Resource("a");
const b = new Resource("b", {
    dependsOn: a,
});

// Create a resource with an alias to an old name.
const aliased = new Resource("aliased", {
    aliases: [{ name: "old-name-for-aliased" }],
});

// Create resources with custom timeouts.
const timeouts = new Resource("timeouts", {
    customTimeouts: {
        create: "1m",
        update: "2m",
        delete: "3m",
    },
});
const timeoutsCreate = new Resource("timeouts-create", {
    customTimeouts: {
        create: "4m",
    },
});
const timeoutsUpdate = new Resource("timeouts-update", {
    customTimeouts: {
        update: "5m",
    },
});
const timeoutsDelete = new Resource("timeouts-delete", {
    customTimeouts: {
        delete: "6m",
    },
});

// Create a resource with additional secret outputs.
const secrets = new Resource("secrets", {
    additionalSecretOutputs: ["foo"],
});

// Create a custom random provider and use it when creating a RandomUuid resource.
const randomProvider = new random.Provider("custom-random-provider");
const uuid = new random.RandomUuid("uuid", {}, {
    provider: randomProvider,
});
