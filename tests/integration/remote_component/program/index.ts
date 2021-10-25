// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

import * as random from "@pulumi/random";

import { Component } from "./component";

const rand = new random.RandomString("random", { length: 10 });

const comp = new Component("component", {
    bar: {
        keepers: {
            "hello": "world",
            "hi": rand.id,
        },
    }
});
