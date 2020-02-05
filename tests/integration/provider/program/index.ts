// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as random from "@pulumi/random";
import { Resource } from "./resource";

// Create a dynamic resource.
const empty = new Resource("empty");

// Create a resource.
const uuid = new random.RandomUuid("uuid");

// Create a provider and resource that uses it.
const provider = new random.Provider("my-provider");
const str = new random.RandomString("str", { length: 10 }, {
    provider: provider,
});
