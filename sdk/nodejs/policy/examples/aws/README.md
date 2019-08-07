# Kubernetes security rules

## Get access to the Pulumi Policy console UI

Ask Chris or Cameron to give you permission in your personal org. Once this is given, open the
JavaScript REPL on pulumi.com and paste this code, which sets the PaC feature flag.

```javascript
localStorage.setItem("features.pac", true);
```

## Build recent pulumi/pulumi

```sh
git clone git@github.com:pulumi/pulumi.git
cd pulumi
make ensure build install
make
```

## Install pulumi-policy

```sh
git clone git@github.com:pulumi/pulumi-policy.git
cd pulumi-policy
make
```

## Install SDK in policy pack project

```sh
# If `/opt/pulumi/bin` is not on your path, run:
#
#     export PATH="$PATH:/opt/pulumi/bin/"

# Now, in `pulumi-policy/` directory.
cd sdk/nodejs/policy/examples/s3
yarn install
yarn link @pulumi/pulumi
yarn link @pulumi/policy
```

## Publish policy pack

Service team gave your personal org access to the Pulumi policy UI, so `<org-name>` here should be
your personal org. (_e.g._, `ekrengel`, `hausdorff`, _etc_.).

```sh
# To start, `<org-name>` should be your Pulumi username and `<policy-pack-name>` should be
# whatever name you would like to use.
$ PULUMI_DEBUG_COMMANDS=true pulumi policy publish <org-name>/<policy-pack-name>
Obtaining policy metadata from policy plugin
Compressing policy pack
Uploading policy pack to Pulumi service
Publishing as <policy-pack-name>
Published as version 1
```

## Enable policy pack for your "org"

```sh
# Same names as before.
PULUMI_DEBUG_COMMANDS=true pulumi policy apply <org-name>/<policy-pack-name> <version>
```

## Run `pulumi up`, receive errors.

```sh
pulumi up # receive errors!
```

## Write your first policy!

Let's write a policy that rejects unencrypted S3 buckets. The rule below uses
`typedRule(aws.s3.Bucket.isInstance, it => ...)` to run the lambda `it => ...` only on S3 buckets.
The rule itself uses `assert.isNotEqual` to make sure the `serverSideEncryptionConfiguration` field
is defined in the resource definition.

```typescript
import * as aws from "@pulumi/aws";
import { assert, Policy, typedRule } from "@pulumi/policy";

const disallowUnencrytpedS3 = {
    name: "disallow-unencrypted-s3",
    description: "Checks whether S3 buckets have encryption turned on.",
    enforcementLevel: "mandatory",
    rules: typedRule(aws.s3.Bucket.isInstance, it => {
        assert.isNotEqual(undefined, it.serverSideEncryptionConfiguration);
    }),
}
```

Add `disallowUnencryptedS3` to the `policies` field of the `PolicyPack` in `index.ts`, and publish a
new version of the policy pack:

```sh
PULUMI_DEBUG_COMMANDS=true pulumi policy publish <org-name>/<policy-pack-name>
PULUMI_DEBUG_COMMANDS=true pulumi policy apply <org-name>/<policy-pack-name> <version>
```
