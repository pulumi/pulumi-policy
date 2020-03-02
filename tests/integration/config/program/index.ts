// Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import * as random from "@pulumi/random";

const str = new random.RandomString("str", {
    length: 10,
});
