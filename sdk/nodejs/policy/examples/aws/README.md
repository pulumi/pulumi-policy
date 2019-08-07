# Kubernetes security rules

## Get access to the Pulumi Policy console UI

Ask Chris or Cameron to give you permission.

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
