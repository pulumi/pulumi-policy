// Copyright 2016-2019, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as pulumi from "@pulumi/pulumi";
import { Resource } from "@pulumi/pulumi";
import * as q from "@pulumi/pulumi/queryable";
import { serve } from "./server";

export interface PolicyPackArgs {
    policies: Policy[];
}

export class PolicyPack {
    private readonly policies: Policy[];

    constructor(private name: string, args: PolicyPackArgs) {
        this.policies = args.policies;

        //
        // TODO: Wire up version information obtained from the service.
        //
        const version = "1";

        serve(this.name, version, this.policies);
    }
}

/** A function that returns true if a resource definition violates some policy. */
export type Rule = (type: string, properties: any) => void;

export function typedRule<TResource extends pulumi.Resource>(
    filter: (o: any) => o is TResource,
    rule: (properties: q.ResolvedResource<TResource>) => void,
): Rule {
    return (type: string, properties: any) => {
        properties.__pulumiType = type;
        if (filter(properties) === false) {
            return;
        }
        return rule(properties);
    };
}

/**
 * A keyword or term to associate with a policy, such as "cost" or "security."
 */
export type Tag = string;

/**
 * Indicates the impact of a policy violation.
 */
export type EnforcementLevel = "advisory" | "mandatory";

/**
 * A policy function that returns true if a resource definition violates some policy (e.g., "no
 * public S3 buckets"), and a set of metadata useful for generating helpful messages when the policy
 * is violated.
 */
export interface Policy {
    /** An ID for the policy. Must be unique to the current policy set. */
    name: string;

    /**
     * A brief description of the policy rule. e.g., "S3 buckets should have default encryption
     * enabled."
     */
    description: string;

    /**
     * A detailed message to display on policy violation. Typically includes an explanation of the
     * policy, and steps to take to remediate.
     */
    message?: string;

    /**
     * Indicates what to do on policy violation, e.g., block deployment but allow override with
     * proper permissions.
     */
    enforcementLevel: EnforcementLevel;

    /**
     * Chain of rules that return true if a resource definition violates a policy (e.g., "S3 buckets
     * can't be public"). Rules are applied in the order they are declared.
     */
    rules: Rule | Rule[];
}

export namespace assert {
    export function isTrue(b: boolean, message?: string) {
        if (b !== true) {
            throw new Error(message);
        }
    }
}
