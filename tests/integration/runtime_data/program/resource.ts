// Copyright 2016-2019, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";

let currentID = 0;

export class Provider implements pulumi.dynamic.ResourceProvider {
    public static readonly instance = new Provider();

    public async create(inputs: any) {
        return {
            id: (currentID++).toString(),
            outs: inputs, // propagate inputs to outputs.
        };
    }
}

export class Resource extends pulumi.dynamic.Resource {
    public isInstance(o: any): o is Resource {
        return o.__pulumiType === "pulumi-nodejs:dynamic:Resource";
    }

    constructor(name: string, args: ResourceArgs, opts?: pulumi.ResourceOptions) {
        super(Provider.instance, name, args, opts);
    }
}

export interface ResourceArgs {
    allConfig: {[key: string]: string};
    getProject: string;
    getStack: string;
    isDryRun: boolean;
}
