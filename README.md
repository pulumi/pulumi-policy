![Build Status](https://github.com/pulumi/pulumi-policy/actions/workflows/main.yml/badge.svg)

# Pulumi Policy SDK

## Overview

Define and manage policy for cloud resources deployed through Pulumi.

Policy rules run during `pulumi preview` and `pulumi up`, asserting that cloud resource definitions
comply with the policy immediately before they are created or updated. Policies may optionally define
remediations that automatically fix policy violations rather than issue warnings.

During `preview`, every rule is run on every resource, and policy violations are batched up
into a final report. During the update, the first policy violation will halt the deployment.

Policy violations can have enforcement levels that are **advisory**, which results in a printed
warning, or **mandatory**, which results in an error after `pulumi preview` or `pulumi up` completes.
The enforcement level **remediate** is stronger than both and enables automatic remediations.

## Getting Started

Please see [Get Started with Policy as Code](https://www.pulumi.com/docs/get-started/crossguard/) to get
started authoring and enforcing policies.

## Documentation

For additional documentation, guides, best practices, and FAQs, see [Policy as Code](https://www.pulumi.com/docs/guides/crossguard/).

## Examples

Looking for examples? Please refer to the [examples repo](https://github.com/pulumi/examples/tree/master/policy-packs).

## Languages

Policies can be written in TypeScript/JavaScript (Node.js) or Python and can be applied to Pulumi stacks written in any language.

- **[TypeScript/JavaScript](https://www.pulumi.com/docs/reference/pkg/nodejs/pulumi/policy/)** - Stable
- **[Python](https://www.pulumi.com/docs/reference/pkg/python/pulumi_policy/)** - Stable
- **.NET** - [Future](https://github.com/pulumi/pulumi-policy/issues/229)
- **Go** - [Future](https://github.com/pulumi/pulumi-policy/issues/230)
