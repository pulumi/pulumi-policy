// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";

let currentID = 0;

export class Provider implements pulumi.dynamic.ResourceProvider {
    public static readonly instance = new Provider();

    public async create(inputs: any) {
        return {
            id: (currentID++).toString(),
            outs: Object.assign({}, inputs), // propagate inputs to outputs.
        };
    }
}

export class Resource extends pulumi.dynamic.Resource {
    constructor(name: string, inputs: any, opts?: pulumi.ResourceOptions) {
        super(Provider.instance, name, inputs, opts);
    }
}
