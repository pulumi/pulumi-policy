## 0.1.2 (unreleased)

### Improvements

- API changes to enable new types of policies (i.e. validating all resource in a stack) and passing
  additional information to validation functions (https://github.com/pulumi/pulumi-policy/pull/131).

  - `Policy.rules` is now `ResourceValidationPolicy.validateResource`.
  - `typedRule` is now `validateTypedResource`.
  - Policy violations are now reported through a `reportViolation` callback, rather than using asserts.
  - A new `StackValidationPolicy` policy type is available for defining policies that check all resources
    in a stack (the API definition is available, but such policies are not enabled yet).
  - Validation functions can now return `Promise<void>`.

  Example:

  ```typescript
  new PolicyPack("aws-policy-pack", {
      policies: [{
          name: "s3-no-public-read",
          description: "Prohibits setting the publicRead or publicReadWrite permission on AWS S3 buckets.",
          enforcementLevel: "mandatory",
          validateResource: validateTypedResource(aws.s3.Bucket.isInstance, (it, args, reportViolation) => {
              if (it.acl === "public-read" || it.acl === "public-read-write") {
                  reportViolation(
                      "You cannot set public-read or public-read-write on an S3 bucket. " +
                      "Read more about ACLs here: https://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html");
              }
          }),
      }],
  });
  ```

### Bug fixes

- Allow policies to deal with Pulumi secret values
  (https://github.com/pulumi/pulumi-policy/pull/115).

## 0.1.1

### Improvements

- Make policy violation error messages two lines (https://github.com/pulumi/pulumi-policy/pull/95).
- Fix polarity issue in policy violation reports (https://github.com/pulumi/pulumi-policy/pull/95).

## 0.1.0

### Major Changes

- Add initial Policy server.
