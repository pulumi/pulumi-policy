// Copyright 2016-2019, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";

import { Resource } from "./resource";

// Create a dynamic resource that passes along runtime data in its inputs and outputs.
// The policy pack will confirm it sees the same data.
const hello = new Resource("Hello", {
    allConfig: pulumi.runtime.allConfig(),
    getProject: pulumi.getProject(),
    getStack: pulumi.getStack(),
    isDryRun: pulumi.runtime.isDryRun(),
});
