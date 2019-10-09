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
import * as q from "@pulumi/pulumi/queryable";

import { serve } from "./server";

/**
 * Arguments for constructing a new PolicyPack object.
 */
export interface PolicyPackArgs {
    // Policies to associate with the policy pack.
    policies: Policy[];

    // Semantic version number of the policy pack code.
    version?: string;
}

/**
 * Defines a collection of policies that will be used to validate resource state during a Pulumi
 * stack preview or update.
 */
export class PolicyPack {
    private readonly policies: Policy[];

    constructor(private name: string, args: PolicyPackArgs) {
        this.policies = args.policies;

        serve(this.name, args.version || "1", this.policies);
    }
}

/**
 * A Rule verifies the resource provided matches some expected state, and if not
 * throws an exception of type AssertionError with a description of the problem.
 * Otherwise, it is assumed the resource has been successfully verified.
 *
 * For example:
 * ```
 * const r = (type: string, properties: any) => {
 *     console.log(`Inspecting resource with type ${type} with properties:\n${JSON.stringify(properties)}`);
 * };
 * ```
 */
export type Rule = (type: string, properties: any) => void;

/**
 * typedRule provides a convenient shorthand for creating new rules that are only
 * executed against resources of a specific type. For example:
 *
 * ```
 * import * as assert from "assert";
 * import * as aws as "@pulumi/aws";
 *
 * typedRule(aws.s3.Bucket.isInstance, (s3Bucket: any) => {
 *     assert.ok(it.acl === "public-read", `The S3 bucket s3://${s3Bucket["name"]} is public.`);
 * });
 * ```
 *
 * @param filter is a type guard, verifying the provided value is an instance of the
 * type the resource the policy whishes to inspect. Typically Pulumi libraries have
 * a static method `isInstance()` defined on resource types that can be used for
 * this purpose.
 * @param rule provides the implementation to check the provided resource state for
 * any violations or errors.
 */
export function typedRule<TResource extends pulumi.Resource>(
    filter: (o: any) => o is TResource,
    rule: (properties: q.ResolvedResource<TResource>) => void,
): Rule {
    return (type: string, properties: any) => {
        // The generated code for `isInstance` simply inspects a `__pulumiType` field,
        // which isn't a regular output property of a resource. So we add it here before
        // executing the provided filter.
        properties.__pulumiType = type;
        if (filter(properties) === false) {
            return;
        }
        return rule(properties);
    };
}

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
    /** An ID for the policy. Must be unique within the current policy pack. */
    name: string;

    /**
     * A human-friendly description of the policy being validated. e.g., "S3 buckets should have default
     * encryption enabled."
     */
    description: string;

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
