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

import { Resource } from "@pulumi/pulumi";
import * as q from "@pulumi/pulumi/queryable";
import { serve } from "./server";

/**
 * The set of arguments for constructing a PolicyPack.
 */
export interface PolicyPackArgs {
    /**
     * The policies associated with a PolicyPack.
     */
    policies: Policies;
}

/**
 * A PolicyPack contains one or more policies to enforce.
 */
export class PolicyPack {
    private readonly policies: Policies;

    constructor(private name: string, args: PolicyPackArgs) {
        this.policies = args.policies;

        //
        // TODO: Wire up version information obtained from the service.
        //
        const version = "1";

        serve(this.name, version, this.policies);
    }
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
    /** An ID for the policy. Must be unique to the current policy set. */
    name: string;

    /**
     * A brief description of the policy rule. e.g., "S3 buckets should have default encryption
     * enabled."
     */
    description: string;

    /**
     * Indicates what to do on policy violation, e.g., block deployment but allow override with
     * proper permissions.
     */
    enforcementLevel: EnforcementLevel;
}

/**
 * An array of Policies.
 */
export type Policies = (ResourceValidationPolicy | StackValidationPolicy)[];

/**
 * ResourceValidationPolicy is a policy that validates a resource definition.
 */
export interface ResourceValidationPolicy extends Policy {
    /**
     * A callback function that validates if a resource definition violates a policy (e.g. "S3 buckets
     * can't be public"). A single callback function can be specified, or multiple functions, which are
     * called in order.
     */
    validateResource: ResourceValidation | ResourceValidation[];
}

/**
 * ResourceValidation is the callback signature for a `ResourceValidationPolicy`. A resource validation
 * is passed `args` with more information about the resource and a `reportViolation` callback that can be
 * used to report a policy violation. `reportViolation` can be called multiple times to report multiple
 * violations against the same resource. `reportViolation` must be passed a message about the violation.
 * The `reportViolation` signature accepts an optional `urn` argument, which is ignored when validating
 * resources (the `urn` of the resource being validated is always used).
 */
export type ResourceValidation = (args: ResourceValidationArgs, reportViolation: ReportViolation) => Promise<void> | void;

/**
 * ResourceValidationArgs is the argument bag passed to a resource validation.
 */
export interface ResourceValidationArgs {
    /**
     * The type of the Resource.
     */
    type: string;

    /**
     * The properties of the Resource.
     */
    props: Record<string, any>;

    // TODO: Add support for the following:
    //
    // urn: string;
    // name: string;
    // opts: PolicyResourceOptions;
}

/**
 * A helper function that returns a strongly-typed resource validation function.
 * @param typeFilter A type guard used to determine if the args are an instance of the resource.
 * @param validate A callback function that validates if the resource definition violates a policy.
 */
export function validateTypedResource<TResource extends Resource>(
    typeFilter: (o: any) => o is TResource,
    validate: (
        resource: q.ResolvedResource<TResource>,
        args: ResourceValidationArgs,
        reportViolation: ReportViolation) => Promise<void> | void,
): ResourceValidation {
    return (args: ResourceValidationArgs, reportViolation: ReportViolation) => {
        args.props.__pulumiType = args.type;
        if (typeFilter(args.props) === false) {
            return;
        }
        validate(args.props as q.ResolvedResource<TResource>, args, reportViolation);
    };
}

/**
 * A helper function that returns `props` as a strongly-typed resolved resource based
 * on the specified `type` when `filter` returns true, otherwise `undefined` is returned.
 * @param typeFilter A type guard used to determine if the args are an instance of the resource.
 * @param args Argument bag for specifying the `type` and `props`.
 */
export function asTypedResource<TResource extends Resource>(
    typeFilter: (o: any) => o is TResource,
    args: { type: string, props: Record<string, any> },
): q.ResolvedResource<TResource> | undefined {
    args.props.__pulumiType = args.type;
    if (typeFilter(args.props) === false) {
        return undefined;
    }
    return args.props as q.ResolvedResource<TResource>;
}

/**
 * StackValidationPolicy is a policy that validates a stack.
 */
export interface StackValidationPolicy extends Policy {
    /**
     * A callback function that validates if a stack violates a policy.
     */
    validateStack: StackValidation;
}

/**
 * StackValidation is the callback signature for a `StackValidationPolicy`. A stack validation is passed
 * `args` with more information about the stack and a `reportViolation` callback that can be used to
 * report a policy violation. `reportViolation` can be called multiple times to report multiple violations
 * against the stack. `reportViolation` must be passed a message about the violation, and an optional `urn`
 * to a resource in the stack that's in violation of the policy. Not specifying a `urn` indicates the
 * overall stack is in violation of the policy.
 */
export type StackValidation = (args: StackValidationArgs, reportViolation: ReportViolation) => Promise<void> | void;

/**
 * StackValidationArgs is the argument bag passed to a resource validation.
 */
export interface StackValidationArgs {
    /**
     * The resources in the stack.
     */
    resources: PolicyResource[];
}

/**
 * PolicyResource represents a resource in the stack.
 */
export interface PolicyResource {
    /**
     * The type of the Resource.
     */
    type: string;

    /**
     * The outputs of the Resource.
     */
    props: Record<string, any>;

    // TODO: Add support for the following:
    //
    // urn: string;
    // name: string;
    // opts: PolicyResourceOptions;
}

/**
 * ReportViolation is the callback signature used to report policy violations.
 */
export type ReportViolation = (message: string, urn?: string) => void;
