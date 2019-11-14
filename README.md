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
find examples of existing policy packs, please refer to the [examples repo](https://github.com/pulumi/examples/tree/master/policy-packs).

## Trying the Policy Framework

In this guide, we'll show you how to install the required packages, and take a brief tour of the
Policy SDK.

This beta feature is also available via the Pulumi Console. To get this feature enabled for your Pulumi organization, you can reach out to us via email or this [Contact Us form](https://www.pulumi.com/contact/).

### Verify your version of the Pulumi CLI

```sh
pulumi version # should be v1.5.2 or later
```

If you need to upgrade your Pulumi CLI, you can find instructions [here](https://www.pulumi.com/docs/get-started/install/).

### Authoring a Policy Pack

1. Create a directory for your new Policy Pack, and change into it.

    ```sh
    mkdir policypack && cd policypack
    ```

1. Run the `pulumi policy new` command. Since Policy as Code is a beta feature, you will need to set `PULUMI_EXPERIMENTAL=true` as an environment variable or simply pre-append it to your commands as shown.

    ```sh
    PULUMI_EXPERIMENTAL=true pulumi policy new aws-typescript
    ```

1. Tweak the Policy Pack in the `index.ts` file as desired. The existing policy in the template (which is annotated below) mandates that an AWS S3 bucket not have public read or write permissions enabled. Each Policy must have a unique name, an enforcement level, and a validation function. Here we use `validateTypedResource` that allows us to validate S3 Bucket resources.

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

            // The validateTypedResource function allows you to filter resources. In this case, the rule only
            // applies to S3 buckets and reports a violation if the acl is "public-read" or "public-read-write".
            validateResource: validateTypedResource(aws.s3.Bucket, (bucket, args, reportViolation) => {
                if (bucket.acl === "public-read" || bucket.acl === "public-read-write") {
                    reportViolation(
                        "You cannot set public-read or public-read-write on an S3 bucket. " +
                        "Read more about ACLs here: https://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html");
                }
            }),
        }],
    });
    ```

You can find more example Policy Packs in the [examples repo](https://github.com/pulumi/examples/tree/master/policy-packs). Best practices for writing a Policy Pack can be found [here](#Best-Practices-for-Writing-Policies).

### Test the new Policy Pack

Policy Packs can be tested on a user's local workstation to facilitate rapid development and testing of policies. This removes the step of publishing and applying policy packs to the Pulumi Console and lets developers reference a policy pack on their local workstation.

1. Run `npm install` in the Policy Pack directory.

1. Use the `--policy-pack` flag with `pulumi preview` or `pulumi up` to specify the path to the directory containing your Policy Pack when previewing/updating a Pulumi project.

    If you don’t have a Pulumi project readily available, you can create a new project for testing by running `pulumi new aws-typescript` in an empty directory. This AWS example will create an S3 bucket, which is perfect for testing our Policy.

    In the Pulumi project's directory run:

    ```sh
    PULUMI_EXPERIMENTAL=true pulumi preview --policy-pack <path-to-policy-pack-directory>
    ```

    If the stack is in compliance, we expect the output to simply tell us which Policy Packs were run.

    ```sh
    PULUMI_EXPERIMENTAL=true pulumi preview --policy-pack policy-pack-typescript
    Previewing update (dev):

        Type                 Name          Plan
    +   pulumi:pulumi:Stack  test-dev  	create
    +   └─ aws:s3:Bucket     my-bucket     create

    Resources:
        + 2 to create

    Permalink:
    ...
    ```

1. We can then edit the stack code to specify the ACL to be public-read.

    ```typescript
    const bucket = new aws.s3.Bucket("my-bucket", {
        acl: "public-read",
    });
    ```

1. We then run the `pulumi preview` command again and this time get an error message indicating we failed the preview because of a policy violation.

    ```sh
    PULUMI_EXPERIMENTAL=true pulumi preview --policy-pack ~/policy-pack-typescript
    Previewing update (dev):

        Type                 Name          Plan       Info
    +   pulumi:pulumi:Stack  test-dev  	create     1 error
    +   └─ aws:s3:Bucket     my-bucket     create     1 error

    Diagnostics:
    pulumi:pulumi:Stack (test-dev):
        error: preview failed

    aws:s3:Bucket (my-bucket):
        mandatory: [s3-no-public-read] Prohibits setting the publicRead or publicReadWrite permission on AWS S3 buckets.
        You cannot set public-read or public-read-write on an S3 bucket. Read more about ACLs here: https://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html

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
| "The RDS cluster must have audit logging enabled." | "Enable audit logging." |

This format provides a clear message to end users, allowing them to understand what and why a policy is failing.
