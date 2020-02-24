## HEAD (Unreleased)

### Improvements

- Expose options, parent, dependencies, and provider config (https://github.com/pulumi/pulumi-policy/pull/184).

- Fix issue that prevented async policies from failing as expected when using `validateResourceOfType` or
  `validateStackResourcesOfType` (https://github.com/pulumi/pulumi-policy/pull/202).

## 0.4.0 (2020-01-30)

### Improvements

- Add support for using `Config`, `getProject()`, `getStack()`, and `isDryRun()` from Policy Packs
  via upgraded dependency on `@pulumi/pulumi` v1.8.0 (requires v1.8.0 or later of the Pulumi SDK) (https://github.com/pulumi/pulumi-policy/pull/169).

- Provide easier type checking for `validateStack`, along with `isType` and `asType` helper functions
  (https://github.com/pulumi/pulumi-policy/pull/173).

  Example:

  ```typescript
  {
      validateStack: validateStackResourcesOfType(aws.s3.Bucket, (buckets, args, reportViolation) => {
          for (const bucket of buckets) {
              // ...
          }
      }),
  }
  ```

- `validateTypedResource` is now deprecated in favor of `validateResourceOfType`. `validateTypedResource`
  will be removed in an upcoming version. (https://github.com/pulumi/pulumi-policy/pull/173).

- Attempting to access an unknown property value during previews from a stack validation callback now results
  in an advisory violation like what happens when doing the same from a resource validation callback
  (https://github.com/pulumi/pulumi-policy/pull/180).

## 0.3.0 (2019-11-26)

### Improvements

- Add `"disabled"` to `EnforcementLevel` to disable policies
  (https://github.com/pulumi/pulumi-policy/pull/156).
- Add resource `urn` and `name` properties along with support for reporting the URN associated with
  a stack validation policy violation (https://github.com/pulumi/pulumi-policy/pull/151).

## 0.2.0 (2019-11-13)

### Improvements

- API changes to enable new types of policies (i.e. validating all resource in a stack) and passing
  additional information to validation functions (https://github.com/pulumi/pulumi-policy/pull/131).

  - `Policy.rules` is now `ResourceValidationPolicy.validateResource`.
  - `typedRule` is now `validateTypedResource`.
  - Policy violations are now reported through a `reportViolation` callback, rather than using asserts.
  - A new `StackValidationPolicy` policy type is available for defining policies that check all resources
    in a stack.
  - Validation functions can now be async and return `Promise<void>`.

  Example:

  ```typescript
  new PolicyPack("aws-policy-pack", {
      policies: [{
          name: "s3-no-public-read",
          description: "Prohibits setting the publicRead or publicReadWrite permission on AWS S3 buckets.",
          enforcementLevel: "mandatory",
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
