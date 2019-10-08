[![Build Status](https://travis-ci.com/pulumi/pulumi-policy.svg?token=eHg7Zp5zdDDJfTjY8ejq&branch=master)](https://travis-ci.com/pulumi/pulumi-policy)

# Pulumi policy framework

Status: **beta release.**

Define and manage policy for cloud resources deployed through for Pulumi.

Policy rules run during `pulumi preview` and `pulumi up`, asserting that cloud resource definitions
comply with the policy immediately before they are created or updated.

During `preview`, every every rule is run on every resource, and policy violations are batched up
into a final report. During the update, the first policy violation will halt the deployment.

Policy violations can have enforcement levels that are **advisory**, which results in a printed
warning, or **mandatory**, which results in an error after `pulumi preview` or `pulumi up` complete.

## Trying the policy framework

In this guide, we'll show you how to install the required packages, and take a brief tour of the
Policy SDK.

### Verify your version of the Pulumi CLI

```sh
pulumi version # should be > v1.0.0-beta.1
```

### Build the AWS examples

```sh
cd sdk/nodejs/policy/examples/aws
yarn install
```

### Run `pulumi up` with the policy pack

When you run `pulumi up` or `pulumi preview` with the `--policy-pack` argument, it will validate
every resource you declare against the policies in the pack. `preview` will attempt to run all
policies over all resource definitions, reporting as many policy violations as it can. During the
update itself, any policy violation will cause the update to halt immediately, to protect resources

You might not get errors if you don't have any resources that violate policy!
We'll get to that soon enough.

In the previous step, you built the AWS examples policy pack. Supply the path to that directory in
place of the `<path-to-aws-policies>` argument below.

```sh
# In the directory of a Pulumi app. Make sure @pulumi/pulumi is `latest`!
yarn upgrade @pulumi/pulumi
# The `--policy-pack` flag is currently behind the `DEBUG` flag.
PULUMI_DEBUG_COMMANDS=true pulumi up --policy-pack=<path-to-aws-policies>
```

### Write your first policy!

Let's write a policy that rejects unencrypted S3 buckets. The rule below uses
`typedRule(aws.s3.Bucket.isInstance, it => ...)` to run the lambda `it => ...` only on S3 buckets.
The rule itself uses the Node.js built-in `assert.notStrictEqual` to make sure the
`serverSideEncryptionConfiguration` field is defined in the resource definition.

```typescript
import * as aws from "@pulumi/aws";
import { Policy, typedRule } from "@pulumi/policy";
import * as assert from "assert";

const disallowUnencrytpedS3 = {
    name: "disallow-unencrypted-s3",
    description: "Checks whether S3 buckets have encryption turned on.",
    enforcementLevel: "mandatory",
    rules: typedRule(aws.s3.Bucket.isInstance, it => {
        assert.notStrictEqual(it.serverSideEncryptionConfiguration, undefined);
    }),
}
```

Add `disallowUnencryptedS3` to the `policies` field of the `PolicyPack` in `index.ts`.

When you run `PULUMI_DEBUG_COMMANDS=true pulumi up --policy-pack=<path>` on a stack with public S3 buckets, you'll get an error
if they don't have encryption enabled.
