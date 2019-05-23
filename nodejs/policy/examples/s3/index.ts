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

import { PolicyPack } from "@pulumi/policy";

const policies = new PolicyPack("aws-sec-rules", {
    policies: [
        {
            name: "s3-default-encryption-enabled",
            description: "S3 buckets should have default encryption enabled",
            message:
                "Security team requires default encryption to be enabled for all S3 buckets. " +
                "For remediation instructions see: https://docs.aws.amazon.com/AmazonS3/latest/dev/bucket-encryption.html",
            tags: ["security"],
            enforcementLevel: "warning",
            rule: (type, bucket) => {
                return (
                    type === "aws:s3:Bucket" &&
                    bucket.serverSideEncryptionConfiguration !== undefined
                );
            },
        },
    ],
});
