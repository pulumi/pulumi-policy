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

|    | Language | Status |
| -- | -------- | ------ |
| <img src="https://www.pulumi.com/logos/tech/logo-ts.png" height=38 />     | [TypeScript](./sdk/nodejs) | Stable      |
| <img src="https://www.pulumi.com/logos/tech/logo-js.png" height=38 />     | [JavaScript](./sdk/nodejs) | Stable      |
| <img src="https://www.pulumi.com/logos/tech/logo-python.png" height=38 /> | [Python](./sdk/python)     | Preview     |
| <img src="https://www.pulumi.com/logos/tech/dotnet.png" height=38 />      | .NET                       | Coming Soon |
| <img src="https://www.pulumi.com/logos/tech/logo-golang.png" height=38 /> | Go                         | Coming Soon |
