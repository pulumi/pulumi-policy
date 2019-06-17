# Pulumi Policy Framework Nouns

This document defines the design of the Pulumi policy packages as of the MVP (Q2 2019).

## Introduction

The Pulumi Policy Framework allows users to define resource policies in any of several high-level
langauges. These policies intercept resource operations immediately prior their execution and decide
whether the desired state declared by an app author violates some policy (e.g., "all S3 buckets must
have default encryption enabled").

The policy SDKs defined in this repository thus each have two purposes:

1. To provide a consistent, multi-language implementation of the core policy primitives used to
   define resource policies. Namely: `PolicyPack`, `Policy`, and `Rule`,
   modulo language idioms.
1. To provide an "invisible" gRPC server underneath these primitives that implements the protocol
   the Pulumi engine uses to validate resource definitions.

This document will describe both, even though the policy protocol is defined in the `pulumi/pulumi`
SDKs. The reson for this is to not make it _completely_ trivial for people to build their own policy
SDKs.

## Example

Throughout the various Pulumi resource SDKs, the desired steady state of a resource is specified by
invoking a constructor. For example, in TypeScript, `new MyResource(...)` specifies that our desired
state is to have one `MyResource` with the specified settings. To instruct Pulumi to create or
update this resource, users need only run `pulumi up`.

In this section, we will that policies, for the most part, look and feel like Pulumi resources, with
a few twists. We will also see that there is a set of commands that are somewhat similar to `pulumi
up`, though are specialized for policies.

### Declaring policies as code

The core abstraction provided by the policy SDKs is the `PolicyPack`. Superficially it looks quite
similar to "normal" Pulumi resources, in that we call `new PolicyPack` and provide it a list of
`Policy` as argument:

```typescript
// sdk/nodejs/policy/examples/s3/index.ts
import { PolicyPack } from "@pulumi/policy";

const policies = new PolicyPack("aws-sec-rules", {
    policies: [
        {
            name: "s3-default-encryption-enabled",
            description: "S3 buckets should have default encryption enabled",
            message:
                "Security team requires default encryption to be enabled for all S3 buckets. " +
                "For remediation instructions see: https://docs.aws.amazon.com/AmazonS3/latest/dev/bucket-encryption.html",
            tags: ["security"],
            enforcementLevel: "mandatory",
            rule: (type, bucket) => {
                // console.log(process.argv);
                return type === "kubernetes:core/v1:Service" && true;
            },
        },
    ],
});
```

`index.ts` is **a normal TypeScript file**, which happens to take reference
`@pulumi/policy`. It would exist in a plain-old-Node.js directory, like:

```
sdk/nodejs/policy/examples/s3/
    index.ts
    package.json
    tsconfig.json
    yarn.lock
```

It is worth noting that when we say "superficially", we mean that we will see several important
differences in the coming sections.

### Registering policies with the Pulumi service

Once the `PolicyPack` is authored, a policy administrator will likely want to register it with the
Pulumi service. Inside the directory containing `index.ts`, we run:

```sh
$ pulumi policy publish --non-interactive
Generating package metadata
Packaging repository
Synchronizing with service
```

We will see later the details of what happens here. For now, a high-level view suffices:

* The Pulumi CLI will run the Node.js program in much the same way `pulumi up` does for "normal"
  Pulumi programs.
* The Pulumi CLI will pass flags to the program so that the policy SDK knows to run in "metadata
  mode", which will generate a manifest containing metadata about the policies in the package.
* Once the metadata is completed, the Pulumi CLI will package everything it needs to run the policy
  program up into a tarball, and transmit it along with the metadata.
* The service will then use this metadata to render information about the policy package -- what
  policies are inside, and so on.

Once the `PolicyPack` is registered, the policy administrator must then go into the UI and enable
the policies they'd like.

### Running the policies during a `pulumi up`

Once the policies have been registered and enabled, he next time a user runs `pulumi up`, the
following will happen:

* Policies will be automatically downloaded into a local directory and unpacked.
* The unpacked code will be run inside a policy pack analyzer plugin, and will be passed every
  register resource request for validation.
* Any policy violations will be reported.

This will very probably look like:

```sh
$ pulumi validate my-policies.ts
2 resource(s) failed policy: Disallow Services with type LoadBalancer
    - foo/myservice1
    - foo/myservice2
Additional information: Services where `.spec.type` is set to 'LoadBalancer' will cause the
underlying cloud provider to spin up a managed load balancer. This is both costly and insecure, as
it will cause a public IP address to be allocated to the Service. You should use one of Ingress
objects that is already provisioned instead.
```

## Execution model

At a high level, the protocol looks like this:

```
+---------+
| Pulumi  |
| Service |
+---------+
    ^
    |
  [ policy    ]
  [ violation ]                   +----------------------+
  [ event     ]                   | PolicyPack           |
    |                             |                      |
+--------+                        | +---------------+    |
|        | --[ Analyze ]----------->|               |    |
| engine | <-[ policy violations ]--| gRPC endpoint |    |
|        |                        | |               |    |
+--------+                        | +---------------+    |
                                  |        ^             |
                                  |        |             |
                                  |    +--------+        |
                                  |    | Policy |        |
                                  |    +--------+        |
                                  |    | Policy |        |
                                  |    +--------+        |
                                  |        ...           |
                                  +----------------------+
```

From this diagram, we can see `PolicyPack` has several responsibilities:

1. Hold a set of `Policy` that can validate resource definitions.
1. Host a gRPC server that implements the `Analyzer` protocol exposed by pulumi/pulumi --
   specifically exposing the `Analyze` RPC that will provide policy violations in response to some
   resoiurce definition.

The engine, in turn, has the following responsibilities:

1. Invoke the `Analyze` RPC, and receive policy violations as a result.
1. Batch up and return policy violations and report them to the Pulumi service using engine events.


In design document `02-sequence-of-calls.md`, we will see exactly how this protocol works.
