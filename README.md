[![Build Status](https://travis-ci.com/pulumi/pulumi-policy.svg?token=eHg7Zp5zdDDJfTjY8ejq&branch=master)](https://travis-ci.com/pulumi/pulumi-policy)

# Pulumi Policy Framework

Status: **beta release.**

## Overview

Define and manage policy for cloud resources deployed through for Pulumi.

Policy rules run during `pulumi preview` and `pulumi up`, asserting that cloud resource definitions
comply with the policy immediately before they are created or updated.

During `preview`, every every rule is run on every resource, and policy violations are batched up
into a final report. During the update, the first policy violation will halt the deployment.

Policy violations can have enforcement levels that are **advisory**, which results in a printed
warning, or **mandatory**, which results in an error after `pulumi preview` or `pulumi up` complete.

## Examples

Looking for examples? The @pulumi/policy module is the core SDK for authoring new Pulumi policies using code. To
find examples of existing policy packs, please refer to the [examples repo](https://github.com/pulumi/examples/policy-packs).

## Trying the Policy Framework

In this guide, we'll show you how to install the required packages, and take a brief tour of the
Policy SDK.

This beta feature is also available via the Pulumi Console. To get this feature enabled for your Pulumi organization, you can reach out to us via email or this [Contact Us form](https://www.pulumi.com/contact/).

### Verify your version of the Pulumi CLI

```sh
pulumi version # should be > v1.0.0-beta.1
```

If you need to upgrade your Pulumi CLI, you can find instructions [here](https://www.pulumi.com/docs/get-started/install/).

### Get the template Policy Pack

```sh
git clone git@github.com:pulumi/templates-policy.git
mkdir testing-policy
cd testing-policy
cp -r <path-to-template-repo>/policy-pack-typescript/* .
npm install
```

### Tweak the template Policy Pack as desired

Tweak the Policy Pack in the index.ts file as desired. The existing policy in the template (which is annotated below) mandates that an AWS S3 bucket not have public read or write permissions enabled. A Policy Pack can contain up to 25 Policies. Each Policy must have a unique name, an enforcement level and at least one rule. Here we use a typeRule that allows us to create an assertion against all S3 resources.

```typescript
// Create a new Policy Pack.
new PolicyPack("policy-pack-typescript", {
    // Specify the Policies in the Policy Pack.
    policies: [{
        // The name for the Policy must be unique within the Pack.
        name: "s3-no-public-read",

        // The description should document what the Policy does and why it exists.
        description: "Prohibits setting the publicRead or publicReadWrite permission on AWS S3 buckets.",

        // The enforcement level can either be "advisory" or "mandatory". An "advisory" enforcement level
        // simply prints a warning for users, while a "mandatory" policy will block an update from proceeding.
        enforcementLevel: "mandatory",

        // One or more rules can be specified as part of a Policy.
        rules: [
            // The typedRule function allows you to filter resources. In this case, the rule only
            // applies to S3 buckets and asserts that the acl is not "public-read" nor "public-read-write".
            // If the assertion fails, the custom assertion message will be displayed to users.
            typedRule(aws.s3.Bucket.isInstance, it => assert.ok(it.acl !== "public-read"
                && it.acl !== "public-read-write",
                "You cannot set public-read or public-read-write on an S3 bucket. " +
                "Read more about ACLs here: https://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html")),
        ],
    }],
});
```

You can find more example Policy Packs in the [examples repo](https://github.com/pulumi/examples/policy-packs). Best practices for writing a Policy Pack can be found [here](#Best-Practices-for-Writing-Policies).

### Test the new Policy Pack

To test your new Policy Pack out, you will need to set `PULUMI_DEBUG_COMMANDS=true` as an environment variable or simply pre-append it to your commands as shown below. This environment variable is required because Policy as Code is a beta feature.

Use the `--policy-pack` flag by navigating to a directory that contains a Pulumi stack. This flag allows for a quicker feedback loop when developing a Policy Pack.

If you don’t have a stack readily available, you can create a new stack for testing by running `pulumi new aws-typescript` in an empty directory. This AWS example will create an S3 bucket, which is perfect for testing out the template Policy Pack.

In the stack directory run:

```sh
# The `--policy-pack` flag is currently behind the `DEBUG` flag.
$ PULUMI_DEBUG_COMMANDS=true pulumi preview \
--policy-pack <path-to-new-policy-pack-directory>
```

If the stack is in compliance, we expect the output to simply tell us which Policy Packs were run.

```sh
$ PULUMI_DEBUG_COMMANDS=true pulumi preview \
--policy-pack ~/policy-pack-typescript
Previewing update (dev):

     Type                 Name          Plan
 +   pulumi:pulumi:Stack  test-dev  	create
 +   └─ aws:s3:Bucket     my-bucket     create

Resources:
    + 2 to create

Permalink:
...
```

We can then edit the stack code in `index.ts` to specify the ACL to be public-read.

```typescript
const bucket = new aws.s3.Bucket("my-bucket", {
    acl: "public-read",
});
```

We then run the pulumi preview command again and this time get an error message indicating we failed the preview because of a policy violation.

```sh
$ PULUMI_DEBUG_COMMANDS=true pulumi preview \
--policy-pack ~/policy-pack-typescript
Previewing update (dev):

     Type                 Name          Plan       Info
 +   pulumi:pulumi:Stack  test-dev  	create     1 error
 +   └─ aws:s3:Bucket     my-bucket     create     1 error

Diagnostics:
  pulumi:pulumi:Stack (test-dev):
    error: preview failed

  aws:s3:Bucket (my-bucket):
    mandatory: [s3-no-public-read] Prohibits setting the publicRead or publicReadWrite permission on AWS S3 buckets.
    expected value 'true' to == 'false'

Permalink:
...
```

## Best Practices for Writing Policies

### Naming Policies

Each policy within a Policy Pack must have a unique name. The name must be between 1 and 100 characters and may contain letters, numbers, dashes (-), underscores (_) or periods(.).

### Policy Assertions

Policy assertions should be complete sentences, specify the resource that has violated the policy, and be written using an imperative tone. The table below provides some examples of policy assertions.

| ✅ | ❌ |
| --- | ----------- |
| "The RDS cluster must specify a node type." | "Specify a node type." |
| "The RDS cluster must have audit logging enabled." | “Enable audit logging.” |

This format provides a clear message to end users, allowing them to understand what and why a policy is failing.
