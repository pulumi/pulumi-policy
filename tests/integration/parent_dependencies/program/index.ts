// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as random from "@pulumi/random";
import { Resource } from "./resource";

// Create resources with a parent/child relationship.
const parent = new Resource("parent");
const child = new Resource("child", {
    parent: parent,
});

// Create resources with an explicit dependency relationship.
const a = new Resource("a");
const b = new Resource("b", {
    dependsOn: a,
});

// Create a resource with an implicit dependency relationship.
const str = new random.RandomString("str", {
    length: 10,
});
const pet = new random.RandomPet("pet", {
    prefix: str.result,
});
