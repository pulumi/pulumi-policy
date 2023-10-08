# Copyright 2016-2020, Pulumi Corporation.  All rights reserved.

import pulumi

from pulumi_policy import (
    EnforcementLevel,
    PolicyPack,
    ResourceValidationPolicy,
    StackValidationPolicy,
)


def validate_resource(args, report_violation):
    verify(args)


def remediate(args):
    verify(args)


def validate_stack(args, report_violation):
    for r in args.resources:
        verify(r)


def verify(r):
    t = r.resource_type
    if t != "pulumi-nodejs:dynamic:Resource":
        return

    assert r.props["secret"] == "a secret value"

    assert isinstance(r.props["fileAsset"], pulumi.FileAsset)
    assert r.props["fileAsset"].path == "index.ts"

    assert isinstance(r.props["stringAsset"], pulumi.StringAsset)
    assert r.props["stringAsset"].text == "some text"

    assert isinstance(r.props["fileArchive"], pulumi.FileArchive)
    assert r.props["fileArchive"].path == "."

    assert isinstance(r.props["assetArchive"], pulumi.AssetArchive)
    assets = r.props["assetArchive"].assets
    assert isinstance(assets["fileAsset"], pulumi.FileAsset)
    assert assets["fileAsset"].path == "index.ts"
    assert isinstance(assets["stringAsset"], pulumi.StringAsset)
    assert assets["stringAsset"].text == "some text"
    assert isinstance(assets["fileArchive"], pulumi.FileArchive)
    assert assets["fileArchive"].path == "."


PolicyPack(
    name="deserialize-policy",
    enforcement_level=EnforcementLevel.MANDATORY,
    policies=[
        ResourceValidationPolicy(
            enforcement_level=EnforcementLevel.REMEDIATE,
            name="resource-validation",
            description="Verifies deserialized properties during resource validation.",
            validate=validate_resource,
            remediate=remediate,
        ),
        StackValidationPolicy(
            name="stack-validation",
            description="Verifies deserialized properties during stack validation.",
            validate=validate_stack,
        ),
    ],
)
