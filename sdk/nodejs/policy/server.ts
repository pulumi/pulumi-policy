// Copyright 2016-2025, Pulumi Corporation.
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

import * as process from "process";

import * as emptyproto from "google-protobuf/google/protobuf/empty_pb";

import * as grpc from "@grpc/grpc-js";

import { Resource, Unwrap } from "@pulumi/pulumi";
import * as analyzerproto from "@pulumi/pulumi/proto/analyzer_pb";
import * as analyzerrpc from "@pulumi/pulumi/proto/analyzer_grpc_pb";
import * as plugproto from "@pulumi/pulumi/proto/plugin_pb";
import * as q from "@pulumi/pulumi/queryable";

import { deserializeProperties, serializeProperties } from "./deserialize";
import {
    EnforcementLevel,
    Policies,
    PolicyCustomTimeouts,
    PolicyPackArgs,
    PolicyPackConfig,
    PolicyProviderResource,
    PolicyResource,
    PolicyResourceOptions,
    ReportViolation,
    ReportViolationArgs,
    ResourceValidationArgs,
    Severity,
    StackValidationArgs,
    getPulumiType,
    isResourcePolicy,
    isStackPolicy,
} from "./policy";
import {
    asGrpcError,
    convertEnforcementLevel,
    Diagnostic,
    makeAnalyzeResponse,
    makeRemediateResponse,
    makeAnalyzerInfo,
    Remediation,
} from "./protoutil";
import { unknownCheckingProxy, UnknownValueError } from "./proxy";
import { version } from "./version";


// ------------------------------------------------------------------------------------------------

// Analyzer RPC implementation. Receives requests from the engine to validate (or `analyze`)
// resources, and validates them against a set of policies provided by the user. Failures are
// returned with metadata about the policy that was violated.

// ------------------------------------------------------------------------------------------------

// Name of the policy pack currently being served, if applicable.
let servingPolicyPack: string | undefined = undefined;

// Regular expression for the policy pack name.
const packNameRE = "^[a-zA-Z0-9-_.]{1,100}$";

// maxRPCMessageSize raises the gRPC Max Message size from `4194304` (4mb) to `419430400` (400mb)
const maxRPCMessageSize = 1024 * 1024 * 400;

let policyPackConfig: Record<string, any> = {};

/**
 * Stack tags are tags for the stack, initially empty, and set via the `configureStack` RPC call.
 */
let stackTags = freezeMap(new Map<string, string>());

/**
  * Starts the gRPC server to communicate with the Pulumi CLI client for analyzing resources.
  *
  * Only one gRPC server can be running at a time, and the port the server is running on will
  * be written to STDOUT.
  *
  * @param policyPackName Friendly name of the policy pack.
  * @param policyPackVersion Version of the policy pack used.
  * @param policyPackEnforcementLevel Enforcement level of the policy pack.
  * @param policies The policies to be served.
  * @internal
  */
export function serve(
    policyPackName: string,
    policyPackVersion: string,
    policyPackEnforcementLevel: EnforcementLevel,
    policyPackArgs: Omit<PolicyPackArgs, "enforcementLevel">,
    initialConfig?: PolicyPackConfig,
): void {
    if (!policyPackName || !policyPackName.match(packNameRE)) {
        console.error(`Invalid policy pack name "${policyPackName}". Policy pack names may only contain alphanumerics, hyphens, underscores, or periods.`);
        process.exit(1);
    }

    const policies = policyPackArgs.policies ?? [];

    for (const policy of policies) {
        if (policy.name === "all") {
            console.error("Invalid policy name \"all\". \"all\" is a reserved name.");
            process.exit(1);
        }

        if (policy.configSchema) {
            if (policy.configSchema.properties?.enforcementLevel) {
                console.error("enforcementLevel cannot be explicitly specified in properties.");
                process.exit(1);
            }
            if (policy.configSchema.required && policy.configSchema.required.includes("enforcementLevel")) {
                console.error("\"enforcementLevel\" cannot be specified in required.");
                process.exit(1);
            }
        }
    }

    if (servingPolicyPack) {
        // We only support running one gRPC instance at a time. (Since the Pulumi CLI is looking for a single
        // PID to be written to STDOUT.) So we just print an error and kill the process if a second policy pack
        // is about to be served.
        console.error(`Already serving policy pack '${servingPolicyPack}'. Only one policy pack may be defined per-process.`);
        process.exit(1);
    }
    servingPolicyPack = policyPackName;

    // Finally connect up the gRPC client/server and listen for incoming requests.
    const server = new grpc.Server({
        "grpc.max_receive_message_length": maxRPCMessageSize,
    });
    server.addService(analyzerrpc.AnalyzerService, {
        analyze: makeAnalyzeRpcFun(policyPackName, policyPackVersion, policyPackEnforcementLevel, policies),
        analyzeStack: makeAnalyzeStackRpcFun(policyPackName, policyPackVersion, policyPackEnforcementLevel, policies),
        remediate: makeRemediateRpcFun(policyPackName, policyPackVersion, policyPackEnforcementLevel, policies),
        getAnalyzerInfo: makeGetAnalyzerInfoRpcFun(policyPackName, policyPackVersion, policyPackEnforcementLevel, policyPackArgs, initialConfig),
        getPluginInfo: getPluginInfoRpc,
        configure: configure,
        configureStack: configureStack,
    });
    server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }

        // Emit the address so the monitor can read it to connect.  The gRPC server will keep the
        // message loop alive.
        // We explicitly convert the number to a string so that Node doesn't colorize the output.
        console.log(port.toString());
    });
}

function configureStack(
    call: grpc.ServerUnaryCall<analyzerproto.AnalyzerStackConfigureRequest, analyzerproto.AnalyzerStackConfigureResponse>,
    callback: grpc.sendUnaryData<analyzerproto.AnalyzerStackConfigureResponse>,
) {
    try {
        const tags = call.request.getTagsMap();
        const map = new Map<string, string>();
        tags.forEach((v, k) => map.set(k, v));
        stackTags = freezeMap(map);

        callback(null, new analyzerproto.AnalyzerStackConfigureResponse());
    } catch (e) {
        callback(asGrpcError(e));
    }
}

/**
 * Returns a read-only wrapper around the provided map.
 */
function freezeMap<K, V>(map: Map<K, V>): ReadonlyMap<K, V> {
    return Object.freeze({
        entries: map.entries.bind(map),
        forEach: map.forEach.bind(map),
        get: map.get.bind(map),
        has: map.has.bind(map),
        keys: map.keys.bind(map),
        size: map.size,
        values: map.values.bind(map),
        [Symbol.iterator]: map[Symbol.iterator].bind(map),
    }) as ReadonlyMap<K, V>;
}

function makeGetAnalyzerInfoRpcFun(
    policyPackName: string,
    policyPackVersion: string,
    policyPackEnforcementLevel: EnforcementLevel,
    policyPackArgs: Omit<PolicyPackArgs, "enforcementLevel">,
    initialConfig?: PolicyPackConfig,
) {
    return async function (call: any, callback: any): Promise<void> {
        try {
            callback(undefined, makeAnalyzerInfo(policyPackName, policyPackVersion, policyPackEnforcementLevel, policyPackArgs, initialConfig));
        } catch (e) {
            callback(asGrpcError(e), undefined);
        }
    };
}

async function getPluginInfoRpc(call: any, callback: any): Promise<void> {
    try {
        const resp: any = new plugproto.PluginInfo();
        resp.setVersion(version);
        callback(undefined, resp);
    } catch (e) {
        callback(asGrpcError(e), undefined);
    }
}

async function configure(call: any, callback: any): Promise<void> {
    const req = call.request;
    try {
        const config: Record<string, any> = {};
        for (const [k, v] of req.getPolicyconfigMap().entries()) {
            const props = v.getProperties().toJavaScript();
            props.enforcementLevel = convertEnforcementLevel(v.getEnforcementlevel());
            config[k] = props;
        }
        policyPackConfig = config;
        // We need to return an new instance of `Empty` from the "google-protobuf/google/protobuf/empty_pb.js" module,
        // but we can't use `Empty` from the module that this package depends on -- it must be from the module that
        // @pulumi/pulumi depends on, because there is an `arg instanceof google_protobuf_empty_pb.Empty` check that
        // will fail if `Empty` isn't from the same module. To workaround, we can simply use
        // `AnalyzerService.configure.responseType`, which is set to `Empty` in @pulumi/pulumi, falling back to `Empty`
        // from our copy of "google-protobuf/google/protobuf/empty_pb.js".
        const Empty = (analyzerrpc.AnalyzerService.configure as any).responseType ?? emptyproto.Empty;
        callback(undefined, new Empty());
    } catch (e) {
        callback(asGrpcError(e), undefined);
    }
}

// analyze is the RPC call that will analyze an individual resource, one at a time, called with the
// "inputs" to the resource, before it is updated.
/** @internal */
export function makeAnalyzeRpcFun(
    policyPackName: string,
    policyPackVersion: string,
    policyPackEnforcementLevel: EnforcementLevel,
    policies: Policies,
) {
    return async function(call: any, callback: any): Promise<void> {
        // Prep to perform the analysis.
        const req: analyzerproto.AnalyzeRequest = call.request;

        const type = req.getType();

        // Run the analysis for every analyzer in the global list, tracking any diagnostics.
        const ds: Diagnostic[] = [];
        let notApplicable: analyzerproto.PolicyNotApplicable[] | undefined = undefined;
        try {
            for (const p of policies) {
                let enforcementLevel: EnforcementLevel =
                    policyPackConfig[p.name]?.enforcementLevel || p.enforcementLevel || policyPackEnforcementLevel;
                if (enforcementLevel === "disabled" || !isResourcePolicy(p)) {
                    continue;
                }
                if (!p.validateResource) {
                    // This is a remediation policy only, so report it as not applicable.
                    const reason = "Policy does not implement validateResource";
                    notApplicable = pushNotApplicable(notApplicable, p.name, reason);
                    continue;
                }

                if (enforcementLevel === "remediate") {
                    // If we ran a remediation, but we are still somehow triggering a violation,
                    // "downgrade" the level we report from remediate to mandatory.
                    enforcementLevel = "mandatory";
                }

                // Fast check to see if the policy isn't applicable when we have a single validation function
                // that has an attached Pulumi type.
                if (!Array.isArray(p.validateResource)) {
                    const pulumiType = getPulumiType(p.validateResource);
                    if (pulumiType && type !== pulumiType) {
                        const reason = `Policy only applies to resources of type '${pulumiType}'`;
                        notApplicable = pushNotApplicable(notApplicable, p.name, reason);
                        continue;
                    }
                }

                const reportViolation = makeReportViolationFun(
                    p.name,
                    policyPackName,
                    policyPackVersion,
                    p.description,
                    enforcementLevel,
                    ds,
                    p.severity,
                );

                const validations = Array.isArray(p.validateResource)
                    ? p.validateResource
                    : [p.validateResource];

                for (const validation of validations) {
                    try {
                        const deserd = deserializeProperties(req.getProperties(), false);
                        const props = unknownCheckingProxy(deserd);
                        const args: ResourceValidationArgs = {
                            type,
                            props,
                            urn: req.getUrn(),
                            name: req.getName(),
                            opts: getResourceOptions(req),
                            stackTags,

                            isType: function <TResource extends Resource>(
                                resourceClass: { new(...rest: any[]): TResource },
                            ): boolean {
                                return isTypeOf(type, resourceClass);
                            },

                            asType: function <TResource extends Resource, TArgs>(
                                resourceClass: { new(name: string, args: TArgs, ...rest: any[]): TResource },
                            ): Unwrap<NonNullable<TArgs>> | undefined {
                                return isTypeOf(type, resourceClass)
                                    ? props as Unwrap<NonNullable<TArgs>>
                                    : undefined;
                            },

                            getConfig: makeGetConfigFun(p.name),

                            notApplicable: throwNotApplicable,
                        };
                        const provider = getProviderResource(req);
                        if (provider) {
                            args.provider = provider;
                        }

                        // Pass the result of the validate call to Promise.resolve.
                        // If the value is a promise, that promise is returned; otherwise
                        // the returned promise will be fulfilled with the value.
                        await Promise.resolve(validation(args, reportViolation));
                    } catch (e) {
                        const policyPack = `'${policyPackName}@v${policyPackVersion}'`;
                        const policyFrom = `policy '${p.name}' from policy pack ${policyPack}`;
                        if (e instanceof UnknownValueError) {
                            const { validateResource, name, ...diag } = p;

                            ds.push({
                                policyName: name,
                                policyPackName,
                                policyPackVersion,
                                message: `can't run ${policyFrom} during preview: ${e.message}`,
                                ...diag,
                                enforcementLevel: "advisory",
                            });
                        } else if (e instanceof NotApplicableError) {
                            notApplicable = pushNotApplicable(notApplicable, p.name, e.reason);
                        } else {
                            throw asGrpcError(e, `Error validating resource with ${policyFrom}`);
                        }
                    }
                }
            }
        } catch (err) {
            callback(err, undefined);
            return;
        }

        // Now marshal the results into a resulting diagnostics list, and invoke the callback to finish.
        callback(undefined, makeAnalyzeResponse(ds, notApplicable));
    };
}

/**
 * Used internally to create an initial resource instance that will be modified to include its
 * parent and dependencies before being passed to the policy validation handler.
 */
interface IntermediateStackResource {
    /** The resource object that will be passed to the policy for analysis. */
    resource: PolicyResource;
    /** The resource's parent URN (if it has one). */
    parent?: string;
    /** The resource's dependencies as URNs. */
    dependencies: string[];
    /** The set of dependencies (URNs) that affect each property. */
    propertyDependencies: Record<string, string[]>;
}

// analyzeStack is the RPC call that will analyze all resources within a stack, at the end of a successful
// preview or update. The provided resources are the "outputs", after any mutations have taken place.
/** @internal */
export function makeAnalyzeStackRpcFun(
    policyPackName: string,
    policyPackVersion: string,
    policyPackEnforcementLevel: EnforcementLevel,
    policies: Policies,
) {
    return async function(call: any, callback: any): Promise<void> {
        // Prep to perform the analysis.
        const req: analyzerproto.AnalyzeStackRequest = call.request;

        const resources = req.getResourcesList();

        // Run the analysis for every analyzer in the global list, tracking any diagnostics.
        const ds: Diagnostic[] = [];
        let notApplicable: analyzerproto.PolicyNotApplicable[] | undefined = undefined;
        try {
            for (const p of policies) {
                let enforcementLevel: EnforcementLevel =
                    policyPackConfig[p.name]?.enforcementLevel || p.enforcementLevel || policyPackEnforcementLevel;
                if (enforcementLevel === "disabled" || !isStackPolicy(p)) {
                    continue;
                }
                if (enforcementLevel === "remediate") {
                    // Stack policies cannot be remediated, so treat the level as mandatory.
                    enforcementLevel = "mandatory";
                }

                // Fast check to see if the policy isn't applicable when we have a validation function
                // that has an attached Pulumi type.
                const pulumiType = getPulumiType(p.validateStack);
                if (pulumiType) {
                    const hasResourcesOfType = resources.some(r => r.getType() === pulumiType);
                    if (!hasResourcesOfType) {
                        const reason = `Policy only applies to resources of type '${pulumiType}'`;
                        notApplicable = pushNotApplicable(notApplicable, p.name, reason);
                        continue;
                    }
                }

                const reportViolation = makeReportViolationFun(
                    p.name,
                    policyPackName,
                    policyPackVersion,
                    p.description,
                    enforcementLevel,
                    ds,
                    p.severity,
                );

                try {
                    const intermediates: IntermediateStackResource[] = [];
                    for (const r of resources) {
                        const type = r.getType();
                        const deserd = deserializeProperties(r.getProperties(), false);
                        const props = unknownCheckingProxy(deserd);
                        const resource: PolicyResource = {
                            type,
                            props,
                            urn: r.getUrn(),
                            name: r.getName(),
                            opts: getResourceOptions(r),

                            // We will go back and fill in the dependencies and optional parent.
                            dependencies: [],
                            propertyDependencies: {},

                            isType: function <TResource extends Resource>(
                                resourceClass: { new(...rest: any[]): TResource },
                            ): boolean {
                                return isTypeOf(type, resourceClass);
                            },

                            asType: function <TResource extends Resource>(
                                resourceClass: { new(...rest: any[]): TResource },
                            ): q.ResolvedResource<TResource> | undefined {
                                return isTypeOf(type, resourceClass)
                                    ? props as q.ResolvedResource<TResource>
                                    : undefined;
                            },
                        };
                        const provider = getProviderResource(r);
                        if (provider) {
                            resource.provider = provider;
                        }
                        intermediates.push({
                            resource,
                            parent: r.getParent(),
                            dependencies: r.getDependenciesList(),
                            propertyDependencies: getPropertyDependencies(r),
                        });
                    }

                    // Create a map of URNs to resources, used to fill in the parent and dependencies
                    // with references to the actual resource objects.
                    const urnsToResources = new Map<string, PolicyResource>();
                    for (const i of intermediates) {
                        urnsToResources.set(i.resource.urn, i.resource);
                    }

                    // Go through each intermediate result and set the parent and dependencies.
                    for (const i of intermediates) {
                        // If the resource has a parent, lookup and set it to the actual resource object.
                        if (i.parent) {
                            const parent = urnsToResources.get(i.parent);
                            if (parent) {
                                i.resource.parent = parent;
                            }
                        }

                        // Set dependencies to actual resource objects.
                        i.resource.dependencies = i.dependencies
                            .map(d => urnsToResources.get(d))
                            .filter(d => d) as PolicyResource[];

                        // Set propertyDependencies to actual resource objects.
                        for (const k of Object.keys(i.propertyDependencies)) {
                            const v = i.propertyDependencies[k];
                            i.resource.propertyDependencies[k] = v
                                .map(d => urnsToResources.get(d))
                                .filter(d => d) as PolicyResource[];
                        }
                    }

                    const args: StackValidationArgs = {
                        resources: intermediates.map(r => r.resource),
                        getConfig: makeGetConfigFun(p.name),
                        stackTags,
                        notApplicable: throwNotApplicable,
                    };

                    // Pass the result of the validate call to Promise.resolve.
                    // If the value is a promise, that promise is returned; otherwise
                    // the returned promise will be fulfilled with the value.
                    await Promise.resolve(p.validateStack(args, reportViolation));
                } catch (e) {
                    const policyPack = `'${policyPackName}@v${policyPackVersion}'`;
                    const policyFrom = `policy '${p.name}' from policy pack ${policyPack}`;
                    if (e instanceof UnknownValueError) {
                        const { validateStack, name, ...diag } = p;

                        ds.push({
                            policyName: name,
                            policyPackName,
                            policyPackVersion,
                            message: `can't run ${policyFrom} during preview: ${e.message}`,
                            ...diag,
                            enforcementLevel: "advisory",
                        });
                    } else if (e instanceof NotApplicableError) {
                        notApplicable = pushNotApplicable(notApplicable, p.name, e.reason);
                    } else {
                        throw asGrpcError(e, `Error validating resource with ${policyFrom}`);
                    }
                }
            }
        } catch (err) {
            callback(err, undefined);
            return;
        }

        // Now marshal the results into a resulting diagnostics list, and invoke the callback to finish.
        callback(undefined, makeAnalyzeResponse(ds, notApplicable));
    };
}

// Creates a function for retrieving the configuration for a policy.
function makeGetConfigFun<T>(policyName: string) {
    return function(): T {
        // If we don't have config, or don't have config for this policy,
        // return an empty object.
        const c = policyPackConfig[policyName];
        if (!c) {
            return <T>{};
        }

        // Otherwise, return the config properties (except enforcementLevel).
        const { enforcementLevel: ef, ...properties } = c;
        return properties;
    };
}

// Creates a PolicyResourceOptions object from the GRPC request.
function getResourceOptions(r: any): PolicyResourceOptions {
    const opts = r.getOptions();
    // If the result of `getOptions` is undefined, an older version of the CLI is being used.
    // Provide a nicer error message to the user.
    if (!opts) {
        throw new Error("A more recent version of the Pulumi CLI is required. " +
            "To upgrade, see https://www.pulumi.com/docs/get-started/install/");
    }
    const result: PolicyResourceOptions = {
        protect: opts.getProtect(),
        ignoreChanges: opts.getIgnorechangesList(),
        aliases: opts.getAliasesList(),
        customTimeouts: getCustomTimeouts(opts),
        additionalSecretOutputs: opts.getAdditionalsecretoutputsList(),
    };
    if (opts.getDeletebeforereplacedefined()) {
        result.deleteBeforeReplace = opts.getDeletebeforereplace();
    }
    if (opts.getParent()) {
        result.parent = opts.getParent();
    }
    return result;
}

// Creates a CustomTimeouts object from the GRPC request.
function getCustomTimeouts(opts: any): PolicyCustomTimeouts {
    const timeouts = opts.getCustomtimeouts();
    return {
        createSeconds: timeouts?.getCreate() ?? 0.0,
        updateSeconds: timeouts?.getUpdate() ?? 0.0,
        deleteSeconds: timeouts?.getDelete() ?? 0.0,
    };
}

// Creates a PolicyProviderResource object from the GRPC request.
function getProviderResource(r: any): PolicyProviderResource | undefined {
    const prov = r.getProvider();
    if (!prov) {
        return undefined;
    }
    const deserd = deserializeProperties(prov.getProperties(), false);
    const props = unknownCheckingProxy(deserd);
    return {
        type: prov.getType(),
        props,
        urn: prov.getUrn(),
        name: prov.getName(),
    };
}

// Creates a Record<string, string[]> from the GRPC request.
function getPropertyDependencies(r: any): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    const map = r.getPropertydependenciesMap();
    if (map) {
        for (const [k, v] of map.entries()) {
            const urns = v.getUrnsList();
            result[k] = urns;
        }
    }
    return result;
}

// Helper to check if `type` is the type of `resourceClass`.
function isTypeOf<TResource extends Resource>(
    type: string,
    resourceClass: { new(...rest: any[]): TResource },
): boolean {
    // Fast check to see if resourceClass has an attached Pulumi type,
    // which is the case for the vast majority of resources (e.g. those
    // generated by SDKgen).
    const pulumiType = getPulumiType(resourceClass);
    if (pulumiType) {
        return type === pulumiType;
    }

    // Otherwise, fallback to using `isInstance`, if it's available,
    // which requires an object allocation.
    const isInstance = (resourceClass as any).isInstance;
    return isInstance &&
        typeof isInstance === "function" &&
        isInstance({ __pulumiType: type }) === true;
}

// Remediate is the RPC call that will remediate an individual resource, one at a time, called with the
// "inputs" to the resource, before it is updated.
/** @internal */
export function makeRemediateRpcFun(
    policyPackName: string,
    policyPackVersion: string,
    policyPackEnforcementLevel: EnforcementLevel,
    policies: Policies,
) {
    return async function(call: any, callback: any): Promise<void> {
        // Prep to perform the analysis.
        const req: analyzerproto.AnalyzeRequest = call.request;

        // Pluck out all of the values common across all remediations. We need to maintain
        // mutations across many remediations which could affect the same resource.
        const urn = req.getUrn();
        const name = req.getName();
        const type = req.getType();
        const opts = getResourceOptions(req);
        let props: any = unknownCheckingProxy(deserializeProperties(req.getProperties(), true));

        // Run any remediations in our policy list.
        const rs: Remediation[] = [];
        let notApplicable: analyzerproto.PolicyNotApplicable[] | undefined = undefined;
        try {
            for (const p of policies) {
                // Only run remediations that are enabled.
                const enforcementLevel: EnforcementLevel =
                    policyPackConfig[p.name]?.enforcementLevel || p.enforcementLevel || policyPackEnforcementLevel;
                if (enforcementLevel !== "remediate" || !isResourcePolicy(p)) {
                    continue;
                }
                if (!p.remediateResource) {
                    // This is an analyze policy only, so report it as not applicable.
                    const reason = "Policy does not implement remediateResource";
                    notApplicable = pushNotApplicable(notApplicable, p.name, reason);
                    continue;
                }

                // Fast check to see if the policy isn't applicable when we have a remediation function
                // that has an attached Pulumi type.
                const pulumiType = getPulumiType(p.remediateResource);
                if (pulumiType && type !== pulumiType) {
                    const reason = `Policy only applies to resources of type '${pulumiType}'`;
                    notApplicable = pushNotApplicable(notApplicable, p.name, reason);
                    continue;
                }

                const args: ResourceValidationArgs = {
                    urn, name, type, opts, props, stackTags,
                    getConfig: makeGetConfigFun(p.name),
                    isType: function <TResource extends Resource>(
                        resourceClass: { new(...rest: any[]): TResource },
                    ): boolean {
                        return isTypeOf(type, resourceClass);
                    },
                    asType: function <TResource extends Resource, TArgs>(
                        resourceClass: { new(name: string, args: TArgs, ...rest: any[]): TResource },
                    ): Unwrap<NonNullable<TArgs>> | undefined {
                        return isTypeOf(type, resourceClass)
                            ? props as Unwrap<NonNullable<TArgs>>
                            : undefined;
                    },
                    notApplicable: throwNotApplicable,
                };
                const provider = getProviderResource(req);
                if (provider) {
                    args.provider = provider;
                }

                // Attempt to run the remediation; wrap this in a try block in case the user code throws.
                let result: any = undefined;
                let diagnostic: string | undefined = undefined;
                try {
                    // Pass the result of the validate call to Promise.resolve.
                    // If the value is a promise, that promise is returned; otherwise
                    // the returned promise will be fulfilled with the value.
                    result = await Promise.resolve(p.remediateResource(args));
                    if (result) {
                        props = result;
                    }
                } catch (e) {
                    const policyPack = `'${policyPackName}@v${policyPackVersion}'`;
                    const policyFrom = `remediation '${p.name}' from policy pack ${policyPack}`;
                    if (e instanceof UnknownValueError) {
                        diagnostic = `can't run ${policyFrom} during preview: ${e.message}`;
                    } else if (e instanceof NotApplicableError) {
                        notApplicable = pushNotApplicable(notApplicable, p.name, e.reason);
                    } else {
                        throw asGrpcError(e, `Error remediating resource with ${policyFrom}`);
                    }
                }

                if (result || diagnostic) {
                    // Serialize the result, which translates runtime objects, secrets, and removes proxies.
                    if (result) {
                        result = await serializeProperties(result);
                    }

                    rs.push({
                        policyName: p.name,
                        policyPackName,
                        policyPackVersion,
                        description: p.description,
                        properties: result,
                        diagnostic: diagnostic,
                    });
                }
            }
        } catch (err) {
            callback(err, undefined);
            return;
        }

        // Now marshal the results into the response, and invoke the callback to finish.
        callback(undefined, makeRemediateResponse(rs, notApplicable));
    };
}

class NotApplicableError extends Error {
    constructor(public readonly reason?: string) {
        super(reason ?? "Policy does not apply");
        this.reason = reason;
    }
}

function throwNotApplicable(reason?: string): never {
    throw new NotApplicableError(reason);
}

/**
 * Helper for adding a not applicable item to the array, creating the array if needed.
 */
function pushNotApplicable(
    notApplicable: analyzerproto.PolicyNotApplicable[] | undefined,
    policyName: string,
    reason?: string,
): analyzerproto.PolicyNotApplicable[] {
    if (!notApplicable) {
        notApplicable = [];
    }
    const na = new analyzerproto.PolicyNotApplicable();
    na.setPolicyName(policyName);
    if (reason) {
        na.setReason(reason);
    }
    notApplicable.push(na);
    return notApplicable;
}

/**
 * Helper for creating a reportViolation function.
 */
function makeReportViolationFun(
    policyName: string,
    policyPackName: string,
    policyPackVersion: string,
    description: string,
    enforcementLevel: EnforcementLevel,
    ds: Diagnostic[],
    severity?: Severity,
): ReportViolation {
    return (message, urn?) => {
        if (typeof message === "object") {
            const policyInfo: ReportViolationArgs = message;
            ds.push({
                policyName: policyInfo.name || policyName,
                policyPackName,
                policyPackVersion,
                message: policyInfo.message || policyInfo.description || description,
                urn: policyInfo.urn,
                description: policyInfo.description || description,
                enforcementLevel: policyInfo.enforcementLevel || enforcementLevel,
                severity: policyInfo.severity || severity,
            });
        } else {
            let violationMessage = description;
            if (message) {
                violationMessage += `\n${message}`;
            }

            ds.push({
                policyName,
                policyPackName,
                policyPackVersion,
                message: violationMessage,
                urn,
                description,
                enforcementLevel,
                severity,
            });
        }
    };
}
