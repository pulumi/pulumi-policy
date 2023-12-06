## HEAD (Unreleased)

---

## 1.9.0 (2023-12-06)

- Explicitly convert gRPC port number to string to prevent node output colorization (https://github.com/pulumi/pulumi-policy/pull/319).

## 1.8.0 (2023-10-10)

- Add support for policy remediations (https://github.com/pulumi/pulumi-policy/pull/314).

## 1.7.0 (2023-07-24)

- Bump `protobufjs` to the latest 7.x major version. Addresses [CVE-2023-36665](https://security.snyk.io/vuln/SNYK-JS-PROTOBUFJS-5756498)
  (https://github.com/pulumi/pulumi-policy/pull/313).

## 1.6.0 (2023-06-28)

- Bump `protobufjs` to the latest 6.x minor version. Addresses [CVE-2022-25878](https://security.snyk.io/vuln/SNYK-JS-PROTOBUFJS-2441248)
  (https://github.com/pulumi/pulumi-policy/pull/308).

## 1.5.0 (2022-10-06)

- Python: Workaround regression introduced by use of ContextVars in the Pulumi Python SDK
  (https://github.com/pulumi/pulumi-policy/pull/288).

## 1.4.0 (2022-01-06)

- Update @grpc/grpc-js dependency to 1.2.7
  (https://github.com/pulumi/pulumi-policy/pull/270).

## 1.3.0 (2021-04-22)

- Upgrade project to use Pulumi v3
  (https://github.com/pulumi/pulumi-policy/pull/266).

## 1.2.0 (2020-05-27)

- Increase the MaxCallRecvMsgSize for all RPC calls
  (https://github.com/pulumi/pulumi-policy/pull/239).

- Add Python support for policy configuration
  (https://github.com/pulumi/pulumi-policy/pull/246).

## 1.1.0 (2020-04-17)

- Replace `grpc` with `@grpc/grpc-js` and upgrade dependencies to 2.0
  (https://github.com/pulumi/pulumi-policy/pull/235).

## 1.0.0 (2020-04-09)

- Remove deprecated `validateTypedResource` helper. Use `validateResourceOfType` instead.
  (https://github.com/pulumi/pulumi-policy/pull/227).

## 0.5.0 (2020-04-01)

- Expose options, parent, dependencies, and provider config (https://github.com/pulumi/pulumi-policy/pull/184).

- Fix issue that prevented async policies from failing as expected when using `validateResourceOfType` or
  `validateStackResourcesOfType` (https://github.com/pulumi/pulumi-policy/pull/202).

- Added a top-level optional `enforcementLevel` on `PolicyPackArgs` and made `enforcementLevel` on `Policy` optional.
  This allows setting the enforcement level at the Policy Pack level which will apply to all policies. Individual
  policies can set their own `enforcementLevel` to override the value specified for the Policy Pack. If no enforcement
  level is specified for either the Policy Pack or Policy, `"advisory"` is used.
  (https://github.com/pulumi/pulumi-policy/issues/192).

- Add support for configuring policies. Policies can now declare their config schema by setting the `config` property,
  and access config values via `args.getConfig<T>()` (https://github.com/pulumi/pulumi-policy/pull/207).

  Example:

  ```typescript
  {
      name: "certificate-expiration",
      description: "Checks whether a certificate has expired.",
      configSchema: {
          properties: {
              expiration: {
                  type: "integer",
                  default: 14,
              },
          },
      },
      validateResource: (args, reportViolation) => {
          const { expiration } = args.getConfig<{ expiration: number }>();

          // ...
      }),
  }
  ```

- Add support for writing policies in Python :tada:
  (https://github.com/pulumi/pulumi-policy/pull/212).

  Example:

  ```python
  def s3_no_public_read(args: ResourceValidationArgs, report_violation: ReportViolation):
      if args.resource_type == "aws:s3/bucket:Bucket" and "acl" in args.props:
          acl = args.props["acl"]
          if acl == "public-read" or acl == "public-read-write":
              report_violation("You cannot set public-read or public-read-write on an S3 bucket.")

  PolicyPack(
      name="aws-policy-pack",
      enforcement_level=EnforcementLevel.MANDATORY,
      policies=[
          ResourceValidationPolicy(
              name="s3-no-public-read",
              description="Prohibits setting the publicRead or publicReadWrite permission on AWS S3 buckets.",
              validate=s3_no_public_read,
          ),
      ],
  )
  ```

## 0.4.0 (2020-01-30)

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

- Add `"disabled"` to `EnforcementLevel` to disable policies
  (https://github.com/pulumi/pulumi-policy/pull/156).
- Add resource `urn` and `name` properties along with support for reporting the URN associated with
  a stack validation policy violation (https://github.com/pulumi/pulumi-policy/pull/151).

## 0.2.0 (2019-11-13)

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

- Allow policies to deal with Pulumi secret values
  (https://github.com/pulumi/pulumi-policy/pull/115).

## 0.1.1

- Make policy violation error messages two lines (https://github.com/pulumi/pulumi-policy/pull/95).
- Fix polarity issue in policy violation reports (https://github.com/pulumi/pulumi-policy/pull/95).

## 0.1.0

- Add initial Policy server.
