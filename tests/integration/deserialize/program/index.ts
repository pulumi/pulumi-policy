// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";

import { Resource } from "./resource";

const hello = new Resource("hello", {
    secret: pulumi.secret("a secret value"),
    fileAsset: new pulumi.asset.FileAsset("index.ts"),
    stringAsset: new pulumi.asset.StringAsset("some text"),
    fileArchive: new pulumi.asset.FileArchive("."),
    assetArchive: new pulumi.asset.AssetArchive({
        fileAsset: new pulumi.asset.FileAsset("index.ts"),
        stringAsset: new pulumi.asset.StringAsset("some text"),
        fileArchive: new pulumi.asset.FileArchive("."),
    }),
});
