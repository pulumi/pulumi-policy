// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";

export interface BarArgs {
    keepers?: pulumi.Input<{[key: string]: pulumi.Input<any>}>;
}

export interface ComponentArgs {
    bar?: pulumi.Input<BarArgs>;
}

export class Component extends pulumi.ComponentResource {
    constructor(name: string, args?: ComponentArgs, opts?: pulumi.ComponentResourceOptions) {
        super("testcomponent:index:Component", name, args, opts, true /*remote*/);
    }
}
