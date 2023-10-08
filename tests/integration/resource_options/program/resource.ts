// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";

let currentID = 0;

export class Provider implements pulumi.dynamic.ResourceProvider {
    public static readonly instance = new Provider();

    public async create(inputs: any) {
        return {
            id: (currentID++).toString(),
            outs: {},
        };
    }
}

export class Resource extends pulumi.dynamic.Resource {
    constructor(name: string, opts?: pulumi.CustomResourceOptions) {
        super(Provider.instance, name, {}, opts);
        if (name === "aliased") {
            console.log("OPTS = " + JSON.stringify(opts));
        }
    }
}
