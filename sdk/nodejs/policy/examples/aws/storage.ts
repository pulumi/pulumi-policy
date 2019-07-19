// Copyright 2016-2019, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as aws from "@pulumi/aws";
import { assert, Policy, typedRule } from "@pulumi/policy";
import { Resource } from "@pulumi/pulumi";
import { toStringSet } from "./compute";

// TODO - note sure how to get at the Policy Document
// https://docs.aws.amazon.com/config/latest/developerguide/s3-blacklisted-actions-prohibited.html
export function s3BucketProhibitedActions(
    name: string,
    prohibitedActions: string | Iterable<string>,
): Policy {
    const actions = toStringSet(prohibitedActions);

    return {
        name: name,
        description: "Checks that a AWS S3 bucket policy does not allow prohibited actions.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: [
            // typedRule(aws.s3.BucketPolicy, it => actions && assert.isTrue(it.policy)),
            // typedRule(
            //     aws.ec2.LaunchConfiguration.isInstance,
            //     it => amis && assert.isTrue(amis.has(it.imageId)),
            // ),
            // typedRule(
            //     aws.ec2.LaunchTemplate.isInstance,
            //     it => amis && assert.isTrue(it.imageId === undefined || amis.has(it.imageId)),
            // ),
        ],
    };
}

// TODO -- id like at add a rule requiring these be prefixed w something
// https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-logging-enabled.html
export function s3bucketLoggingEnabled(
    name: string,
): Policy {
    return {
        name: name,
        description: "Checks whether logging is enabled for your S3 buckets.",
        tags: ["security"],
        enforcementLevel: "advisory",
        rules: [
            typedRule(aws.s3.Bucket.isInstance, it => assert.isTrue(it.loggings.length > 0)),
        ],
    };
}

// TODO -- add rules for these
// https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-policy-grantee-check.html
// https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-policy-not-more-permissive.html

// https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-public-read-prohibited.html
// https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-public-write-prohibited.html
export function s3bucketPublicProhibited(
    name: string,
): Policy {
    return {
        name: name,
        description: "Checks that your Amazon S3 buckets do not allow public read or write access.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: [
            typedRule(aws.s3.Bucket.isInstance, it => assert.isTrue(it.acl !== "public-read"
                && it.acl !== "public-read-write")),
        ],
    };
}

// https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-replication-enabled.html
export function s3bucketReplicationEnabled(
    name: string,
): Policy {
    return {
        name: name,
        description: "Checks whether S3 buckets have cross-region replication enabled.",
        enforcementLevel: "advisory",
        rules: [
            typedRule(aws.s3.Bucket.isInstance, it => assert.isTrue(it.replicationConfiguration !== undefined,
                "Please consider adding a replication configuration for your S3 bucket.")),
        ],
    };
}

// TODO -- may need more assertions here
// https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-server-side-encryption-enabled.html
export const s3bucketServerSideEncryptionEnabled: Policy = {
    name: "s3-bucket-server-side-encryption-enabled",
    description: "Checks that your Amazon S3 bucket either has Amazon S3 default encryption enabled " +
        "or that the S3 bucket policy explicitly denies put-object requests without server side encryption.",
    enforcementLevel: "mandatory",
    rules: typedRule(aws.s3.Bucket.isInstance, it => assert.isTrue(it.serverSideEncryptionConfiguration !== undefined)),
};

// TODO -- need to check policy to do this
// https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-ssl-requests-only.html
export const s3bucketSSLRequestsOnly: Policy = {
    name: "s3-bucket-ssl-requests-only",
    description: "Checks whether S3 buckets have policies that require requests to use Secure Socket Layer (SSL).",
    enforcementLevel: "mandatory",
    rules: [
        // typedRule(aws.s3.Bucket.isInstance, it => assert.isTrue(it.serverSideEncryptionConfiguration !== undefined)),
    ],
};

// https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-versioning-enabled.html
export const s3bucketBucketVersioningEnabled: Policy = {
    name: "s3-bucket-versioning-enabled",
    description: "Checks whether versioning is enabled for your S3 buckets. Optionally, the rule checks if " +
        "MFA delete is enabled for your S3 buckets.",
    enforcementLevel: "advisory",
    rules: typedRule(aws.s3.Bucket.isInstance, it => assert.isTrue(it.versioning !== undefined,
        "We recommend you enable versioning for your bucket.")),
};
