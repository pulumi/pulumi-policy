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

import { Resource, Unwrap } from "@pulumi/pulumi";
import * as q from "@pulumi/pulumi/queryable";

import { PolicyConfigJSONSchema } from "./schema";
import { serve } from "./server";

const defaultEnforcementLevel: EnforcementLevel = "advisory";

/**
 * The set of arguments for constructing a PolicyPack.
 */
export interface PolicyPackArgs {
    /**
     * The policies associated with a PolicyPack. These check for and enforce policies.
     */
    policies: Policies;

    /**
     * Indicates what to do on policy violation, e.g., block deployment but allow override with
     * proper permissions. Default for all policies in the PolicyPack. Individual policies can
     * override.
     */
    enforcementLevel?: EnforcementLevel;
}

/**
 * A PolicyPack contains one or more policies to enforce.
 *
 * For example:
 *
 * ```typescript
 * import * as aws from "@pulumi/aws";
 * import { PolicyPack, validateResourceOfType } from "@pulumi/policy";
 *
 * new PolicyPack("aws-typescript", {
 *     policies: [{
 *         name: "s3-no-public-read",
 *         description: "Prohibits setting the publicRead or publicReadWrite permission on AWS S3 buckets.",
 *         enforcementLevel: "mandatory",
 *         validateResource: validateResourceOfType(aws.s3.Bucket, (bucket, args, reportViolation) => {
 *             if (bucket.acl === "public-read" || bucket.acl === "public-read-write") {
 *                 reportViolation("You cannot set public-read or public-read-write on an S3 bucket.");
 *             }
 *         }),
 *     }],
 * });
 * ```
 */
export class PolicyPack {
    private readonly policies: Policies;

    constructor(private name: string, args: PolicyPackArgs, initialConfig?: PolicyPackConfig) {
        this.policies = args.policies;

        // Get package version from the package.json file.
        const cwd = process.cwd();
        const pkg = require(`${cwd}/package.json`);
        const version = pkg.version;
        if (!version || version === "") {
            throw new Error("Version must be defined in the package.json file.");
        }

        const enforcementLevel = args.enforcementLevel || defaultEnforcementLevel;
        serve(this.name, version, enforcementLevel, this.policies, initialConfig);
    }
}

/**
 * Indicates the impact of a policy violation.
 */
export type EnforcementLevel = "advisory" | "mandatory" | "remediate" | "disabled";

/**
 * Represents configuration for the policy pack.
 */
export type PolicyPackConfig = { [policy: string]: PolicyConfig };
type PolicyConfig = EnforcementLevel | ({ enforcementLevel?: EnforcementLevel } & { [key: string]: any });

/**
 * A policy function that returns true if a resource definition violates some policy (e.g., "no
 * public S3 buckets"), and a set of metadata useful for generating helpful messages when the policy
 * is violated.
 */
export interface Policy {
    /** An ID for the policy. Must be unique within the current policy set. */
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
    enforcementLevel?: EnforcementLevel;

    /**
     * This policy's configuration schema.
     *
     * For example:
     *
     * ```typescript
     * {
     *     configSchema: {
     *         properties: {
     *             expiration: {
     *                 type: "integer",
     *                 default: 14,
     *             },
     *             identifier: {
     *                 type: "string",
     *             },
     *         },
     *     },
     *
     *     validateResource: (args, reportViolation) => {
     *         const { expiration, identifier } = args.getConfig<{ expiration: number; identifier?: string; }>();
     *
     *         // ...
     *     }),
     * }
     * ```
     */
    configSchema?: PolicyConfigSchema;
}

/**
 * Represents the configuration schema for a policy.
 */
export interface PolicyConfigSchema {
    /**
     * The policy's configuration properties.
     */
    properties: {
        [key: string]: PolicyConfigJSONSchema;
    };

    /**
     * The configuration properties that are required.
     */
    required?: string[];
}

/**
 * An array of Policies.
 */
export type Policies = (ResourceValidationPolicy | StackValidationPolicy)[];

/*
 * ResourceRemediation is a callback responsible for remediating a resource policy violation. It can either return
 * new resource properties to be substituted for the old ones, or undefined if no remediation took place.
 */
export type ResourceRemediation =
    (args: ResourceValidationArgs) =>
    Promise<Record<string, any>> | Record<string, any> | Promise<void> | void | undefined;

/**
 * ResourceValidationPolicy is a policy that validates a resource definition.
 *
 * For example:
 *
 * ```typescript
 * import * as aws from "@pulumi/aws";
 * import { validateResourceOfType } from "@pulumi/policy";
 *
 * const s3NoPublicReadPolicy: ResourceValidationPolicy = {
 *     name: "s3-no-public-read",
 *     description: "Prohibits setting the publicRead or publicReadWrite permission on AWS S3 buckets.",
 *     enforcementLevel: "mandatory",
 *     validateResource: validateResourceOfType(aws.s3.Bucket, (bucket, args, reportViolation) => {
 *         if (bucket.acl === "public-read" || bucket.acl === "public-read-write") {
 *             reportViolation("You cannot set public-read or public-read-write on an S3 bucket.");
 *         }
 *     }),
 * };
 * ```
 */
export interface ResourceValidationPolicy extends Policy {
    /**
     * Takes a resource as input and optionally returns a remediated set of properties. Remediations
     * run prior to validations, and give a policy a chance to fix the issue rather than just flag it.
     */
    remediateResource?: ResourceRemediation;

    /**
     * A callback function that validates if a resource definition violates a policy (e.g. "S3 buckets
     * can't be public"). A single callback function can be specified, or multiple functions, which are
     * called in order.
     */
    validateResource?: ResourceValidation | ResourceValidation[];
}

/**
 * ResourceValidation is the callback signature for a `ResourceValidationPolicy`. A resource validation
 * is passed `args` with more information about the resource and a `reportViolation` callback that can be
 * used to report a policy violation. `reportViolation` can be called multiple times to report multiple
 * violations against the same resource. `reportViolation` must be passed a message about the violation.
 * The `reportViolation` signature accepts an optional `urn` argument, which is ignored when validating
 * resources (the `urn` of the resource being validated is always used).
 */
export type ResourceValidation =
    (args: ResourceValidationArgs, reportViolation: ReportViolation) => Promise<void> | void;

/**
 * ResourceValidationArgs is the argument bag passed to a resource validation.
 */
export interface ResourceValidationArgs {
    /**
     * The type of the resource.
     */
    type: string;

    /**
     * The inputs of the resource.
     */
    props: Record<string, any>;

    /**
     * The URN of the resource.
     */
    urn: string;

    /**
     * The name of the resource.
     */
    name: string;

    /**
     * The options of the resource.
     */
    opts: PolicyResourceOptions;

    /**
     * The provider of the resource.
     */
    provider?: PolicyProviderResource;

    /**
     * Returns true if the type of this resource is the same as `resourceClass`.
     *
     * For example:
     *
     * ```typescript
     * if (args.isType(aws.s3.Bucket)) {
     *     // ...
     * }
     * ```
     */
    isType<TResource extends Resource>(
        resourceClass: { new(...rest: any[]): TResource },
    ): boolean;

    /**
     * Returns the resource args for `resourceClass` if the type of this resource is the same as `resourceClass`,
     * otherwise `undefined`.
     *
     * For example:
     *
     * ```typescript
     * const bucketArgs = args.AsType(aws.s3.Bucket);
     * if (bucketArgs) {
     *     // ...
     * }
     * ```
     */
    asType<TResource extends Resource, TArgs>(
        resourceClass: { new(name: string, args: TArgs, ...rest: any[]): TResource },
    ): Unwrap<NonNullable<TArgs>> | undefined;

    /**
     * Returns configuration for the policy.
     */
    getConfig<T extends object>(): T;
}

/**
 * PolicyResourceOptions is the bag of settings that control a resource's behavior.
 */
export interface PolicyResourceOptions {
    /**
     * When set to true, protect ensures this resource cannot be deleted.
     */
    protect: boolean;

    /**
     * Ignore changes to any of the specified properties.
     */
    ignoreChanges: string[];

    /**
     * When set to true, indicates that this resource should be deleted before
     * its replacement is created when replacement is necessary.
     */
    deleteBeforeReplace?: boolean;

    /**
     * Additional URNs that should be aliased to this resource.
     */
    aliases: string[];

    /**
     * Custom timeouts for resource create, update, and delete operations.
     */
    customTimeouts: PolicyCustomTimeouts;

    /**
     * Outputs that should always be treated as secrets.
     */
    additionalSecretOutputs: string[];

    /**
     * An optional parent that this resource belongs to.
     */
    parent?: string;
}

/**
 * Custom timeout options.
 */
export interface PolicyCustomTimeouts {
    /**
     * The create resource timeout.
     */
    createSeconds: number;
    /**
     * The update resource timeout.
     */
    updateSeconds: number;
    /**
     * The delete resource timeout.
     */
    deleteSeconds: number;
}

/**
 * Information about the provider.
 */
export interface PolicyProviderResource {
    /**
     * The type of the provider resource.
     */
    type: string;

    /**
     * The properties of the provider resource.
     */
    props: Record<string, any>;

    /**
     * The URN of the provider resource.
     */
    urn: string;

    /**
     * The name of the provider resource.
     */
    name: string;
}

/**
 * TypedResourceRemediation is a callback responsible for remediating a resource policy violation; it is the
 * typed equivalent to `ResourceRemediation` that carries strongly typed properties with it.
 */
export type TypedResourceRemediation<TProps> =
    (props: TProps, args: ResourceValidationArgs) =>
    Promise<Record<string, any>> | Record<string, any> | Promise<void> | void | undefined;

/**
 * A helper function that returns a strongly-typed resource remediation function, used to check only resources of
 * the specified resource type.
 *
 * For example:
 *
 * ```typescript
 * remediateResource: remediateResourceOfType(aws.s3.Bucket, (bucket, args) => {
 *     bucket.tags = { "foo": "bar" };
 *     return bucket;
 * }),
 * ```
 *
 * @param resourceClass Used to filter this check to only resources of the specified resource class.
 * @param remediate A callback function that optionally remediates a resource if it violates a policy.
 */
export function remediateResourceOfType<TResource extends Resource, TArgs>(
    resourceClass: { new(name: string, args: TArgs, ...rest: any[]): TResource },
    remediate: TypedResourceRemediation<Unwrap<NonNullable<TArgs>>>,
): ResourceRemediation {
    return (args: ResourceValidationArgs) => {
        if (args.isType(resourceClass)) {
            return remediate(args.props as Unwrap<NonNullable<TArgs>>, args);
        }
    };
}

/**
 * TypedResourceValidation is the callback signature for `validateResourceOfType`; it is equivlaent to
 * the `ResourceValidation type except that it carries strongly typed properties with it.
 */
export type TypedResourceValidation<TProps> =
    (props: TProps, args: ResourceValidationArgs, reportViolation: ReportViolation) => Promise<void> | void;

/**
 * A helper function that returns a strongly-typed resource validation function, used to check only resources of the
 * specified resource class.
 *
 * For example:
 *
 * ```typescript
 * validateResource: validateResourceOfType(aws.s3.Bucket, (bucket, args, reportViolation) => {
 *     for (const bucket of buckets) {
 *         // ...
 *     }
 * }),
 * ```
 *
 * @param resourceClass Used to filter this check to only resources of the specified resource class.
 * @param validate A callback function that validates if the resource definition violates a policy.
 */
export function validateResourceOfType<TResource extends Resource, TArgs>(
    resourceClass: { new(name: string, args: TArgs, ...rest: any[]): TResource },
    validate: TypedResourceValidation<Unwrap<NonNullable<TArgs>>>,
): ResourceValidation {
    return (args: ResourceValidationArgs, reportViolation: ReportViolation) => {
        if (args.isType(resourceClass)) {
            return validate(args.props as Unwrap<NonNullable<TArgs>>, args, reportViolation);
        }
    };
}

/**
 * TypedResourceValidationRemediation is the callback signature for `validateRemediateResourceOfType`; it is
 * equivlaent to the `ResourceValidation type except that it carries strongly typed properties with it.
 */
export type TypedResourceValidationRemediation<TProps> =
    (props: TProps, args: ResourceValidationArgs, reportViolation: ReportViolation) =>
    Promise<Record<string, any>> | Record<string, any> | Promise<void> | void | undefined;

/**
 * A helper function for the pattern where a single function wants to be able to remediate *and*
 * validate depending on how it is called. It returns both the validateResource and remediateResource
 * functions which can be passed directly to the like-named properties on the policy class.
 *
 * This is typically used in combination with a spread operator. For example:
 *
 * ```typescript
 * policies: [{
 *     name: "...",
 *     ...validateRemediateResourceOfType(aws.s3.Bucket, (bucket, args, reportViolation) => {
 *         ... change bucket state *and* reportViolations ...
 *     },
 * }]
 * ```
 */
export function validateRemediateResourceOfType<TResource extends Resource, TArgs>(
    resourceClass: { new(name: string, args: TArgs, ...rest: any[]): TResource },
    validateRemediate: TypedResourceValidationRemediation<Unwrap<NonNullable<TArgs>>>,
): { validateResource: ResourceValidation; remediateResource: ResourceRemediation } {
    return {
        validateResource: async (args: ResourceValidationArgs, reportViolation: ReportViolation): Promise<void> => {
            if (args.isType(resourceClass)) {
                await validateRemediate(args.props as Unwrap<NonNullable<TArgs>>, args, reportViolation);
            }
        },
        remediateResource: (args: ResourceValidationArgs) => {
            if (args.isType(resourceClass)) {
                return validateRemediate(args.props as Unwrap<NonNullable<TArgs>>, args, (_, __) => { /* ignore */ });
            }
        },
    };
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
 * StackValidationArgs is the argument bag passed to a stack validation.
 */
export interface StackValidationArgs {
    /**
     * The resources in the stack.
     */
    resources: PolicyResource[];

    /**
     * Returns configuration for the policy.
     */
    getConfig<T extends object>(): T;
}

/**
 * PolicyResource represents a resource in the stack.
 */
export interface PolicyResource {
    /**
     * The type of the resource.
     */
    type: string;

    /**
     * The outputs of the resource.
     */
    props: Record<string, any>;

    /**
     * The URN of the resource.
     */
    urn: string;

    /**
     * The name of the resource.
     */
    name: string;

    /**
     * The options of the resource.
     */
    opts: PolicyResourceOptions;

    /**
     * The provider of the resource.
     */
    provider?: PolicyProviderResource;

    /**
     * An optional parent that this resource belongs to.
     */
    parent?: PolicyResource;

    /**
     * The dependencies of the resource.
     */
    dependencies: PolicyResource[];

    /**
     * The set of dependencies that affect each property.
     */
    propertyDependencies: Record<string, PolicyResource[]>;

    /**
     * Returns true if the type of this resource is the same as `resourceClass`.
     *
     * For example:
     *
     * ```typescript
     * for (const resource of args.resources) {
     *     if (resource.isType(aws.s3.Bucket)) {
     *         // ...
     *     }
     * }
     * ```
     */
    isType<TResource extends Resource>(
        resourceClass: { new(...rest: any[]): TResource },
    ): boolean;

    /**
     * Returns the resource if the type of this resource is the same as `resourceClass`,
     * otherwise `undefined`.
     *
     * For example:
     *
     * ```typescript
     * const buckets = args.resources
     *     .map(r = r.asType(aws.s3.Bucket))
     *     .filter(b => b);
     * for (const bucket of buckets) {
     *     // ...
     * }
     * ```
     */
    asType<TResource extends Resource>(
        resourceClass: { new(...rest: any[]): TResource },
    ): q.ResolvedResource<TResource> | undefined;
}

/**
 * A helper function that returns a strongly-typed stack validation function, used to check only resources of the
 * specified resource class.
 *
 * For example:
 *
 * ```typescript
 * validateStack: validateStackResourcesOfType(aws.s3.Bucket, (buckets, args, reportViolation) => {
 *     for (const bucket of buckets) {
 *         // ...
 *     }
 * }),
 * ```
 *
 * @param resourceClass Used to filter this check to only resources of the specified resource class.
 * @param validate A callback function that validates if a stack violates a policy.
 */
export function validateStackResourcesOfType<TResource extends Resource>(
    resourceClass: { new(...rest: any[]): TResource },
    validate: (
        resources: q.ResolvedResource<TResource>[],
        args: StackValidationArgs,
        reportViolation: ReportViolation) => Promise<void> | void,
): StackValidation {
    return (args: StackValidationArgs, reportViolation: ReportViolation) => {
        const filtered = args.resources.filter(r => r.isType(resourceClass));
        if (filtered.length > 0) {
            const filteredTyped = filtered.map(r => r.props as q.ResolvedResource<TResource>);
            const filteredArgs = { resources: filtered, getConfig: args.getConfig };
            return validate(filteredTyped, filteredArgs, reportViolation);
        }
    };
}

/**
 * ReportViolation is the callback signature used to report policy violations.
 */
export type ReportViolation = (message: string, urn?: string) => void;

/**
 * Secret allows values to be marked as sensitive, such that the Pulumi engine will encrypt them
 * as normal with Pulumi secrets upon seeing one returned from a remediation.
 */
export class Secret {
    /**
     * The underlying plaintext value.
     */
    public value: any;

    /**
     * Constructs a new secret value that will be encrypted.
     * @param value The plaintext value to turn into a secret.
     */
    constructor(value: any) {
        this.value = value;
    }
}
