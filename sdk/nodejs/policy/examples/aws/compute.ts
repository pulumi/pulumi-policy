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

export function requireApprovedAmisById(
    name: string,
    approvedAmis: string | Iterable<string>,
): Policy {
    const amis = toStringSet(approvedAmis);

    return {
        name: name,
        description: "Checks whether running instances are using specified AMIs.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: [
            typedRule(aws.ec2.Instance.isInstance, it => amis && assert.isTrue(amis.has(it.ami))),
            typedRule(
                aws.ec2.LaunchConfiguration.isInstance,
                it => amis && assert.isTrue(amis.has(it.imageId)),
            ),
            typedRule(
                aws.ec2.LaunchTemplate.isInstance,
                it => amis && assert.isTrue(it.imageId === undefined || amis.has(it.imageId)),
            ),
        ],
    };
}

// TODO: approved-amis-by-tag
// https://docs.aws.amazon.com/config/latest/developerguide/approved-amis-by-tag.html

export function requireHealthChecksOnAsgElb(name: string): Policy {
    return {
        name: name,
        description:
            "Checks whether your Auto Scaling groups that are associated with a load balancer " +
            "are using Elastic Load Balancing health checks.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: typedRule(aws.autoscaling.Group.isInstance, it => {
            const classicLbAttached = it.loadBalancers.length > 0;
            const albAttached = it.targetGroupArns.length > 0;
            if (classicLbAttached || albAttached) {
                assert.isTrue(it.healthCheckType !== "ELB");
            }
        }),
    };
}

export function requireInstanceTenancy(
    name: string,
    tenancy: "DEDICATED" | "HOST" | "DEFAULT",
    imageIds?: string | Iterable<string>,
    hostIds?: string | Iterable<string>,
): Policy {
    const images = toStringSet(imageIds);
    const hosts = toStringSet(hostIds);

    return {
        name: name,
        description:
            "Checks instances for specified tenancy. Specify AMI IDs to check instances that are " +
            "launched from those AMIs or specify host IDs to check whether instances are " +
            "launched on those Dedicated Hosts.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: [
            typedRule(aws.ec2.Instance.isInstance, it => {
                if (hosts !== undefined && hosts.has(it.hostId)) {
                    assert.isTrue(it.tenancy === tenancy);
                } else if (images !== undefined && images.has(it.ami)) {
                    assert.isTrue(it.tenancy === tenancy);
                }
            }),
            typedRule(aws.ec2.LaunchConfiguration.isInstance, it => {
                if (images !== undefined && images.has(it.imageId)) {
                    assert.isTrue(it.placementTenancy === tenancy);
                }
            }),
        ],
    };
}

export function requireInstanceType(
    name: string,
    instanceTypes: aws.ec2.InstanceType | Iterable<aws.ec2.InstanceType>,
): Policy {
    const types = toStringSet(instanceTypes);

    return {
        name: name,
        description: "Checks whether your EC2 instances are of the specified instance types.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: [
            typedRule(aws.ec2.Instance.isInstance, it => assert.isTrue(types.has(it.instanceType))),
            typedRule(aws.ec2.LaunchConfiguration.isInstance, it =>
                assert.isTrue(types.has(it.instanceType)),
            ),
            typedRule(aws.ec2.LaunchTemplate.isInstance, it =>
                assert.isTrue(it.instanceType !== undefined && types.has(it.instanceType)),
            ),
        ],
    };
}

export function requireEbsOptimization(name: string): Policy {
    // TODO: Enable optimization only for EC2 instances that can be optimized.
    return {
        name: name,
        description: "Checks whether EBS optimization is enabled for all EC2 instances.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: typedRule(aws.ec2.Instance.isInstance, it =>
            assert.isTrue(it.ebsOptimized === true),
        ),
    };
}

export function requireDetailedMonitoring(name: string): Policy {
    return {
        name: name,
        description: "Checks whether detailed monitoring is enabled for EC2 instances.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: typedRule(aws.ec2.Instance.isInstance, it => assert.isTrue(it.monitoring === true)),
    };
}

// TODO: ec2-instance-managed-by-systems-manager
// https://docs.aws.amazon.com/config/latest/developerguide/ec2-instance-managed-by-ssm.html

// TODO: ec2-instances-in-vpc
// https://docs.aws.amazon.com/config/latest/developerguide/ec2-instances-in-vpc.html

// TODO: ec2-managedinstance-applications-blacklisted
// https://docs.aws.amazon.com/config/latest/developerguide/ec2-managedinstance-applications-blacklisted.html

// TODO: ec2-managedinstance-applications-required
// https://docs.aws.amazon.com/config/latest/developerguide/ec2-managedinstance-association-compliance-status-check.html

// TODO: ec2-managedinstance-association-compliance-status-check
// https://docs.aws.amazon.com/config/latest/developerguide/ec2-managedinstance-association-compliance-status-check.html

// TODO: ec2-managedinstance-inventory-blacklisted
// https://docs.aws.amazon.com/config/latest/developerguide/ec2-managedinstance-inventory-blacklisted.html

// TODO: ec2-managedinstance-patch-compliance-status-check
// https://docs.aws.amazon.com/config/latest/developerguide/ec2-managedinstance-patch-compliance-status-check.html

// TODO: ec2-managedinstance-platform-check
// https://docs.aws.amazon.com/config/latest/developerguide/ec2-managedinstance-platform-check.html

export function requireEbsVolumesOnEc2Instances(name: string): Policy {
    // TODO: Check if EBS volumes are marked for deletion.
    return {
        name: name,
        description:
            "Checks whether EBS volumes are attached to EC2 instances. Optionally checks if EBS " +
            "volumes are marked for deletion when an instance is terminated.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: typedRule(aws.ec2.Instance.isInstance, it =>
            assert.isTrue(it.ebsBlockDevices.length > 0),
        ),
    };
}

// TODO: eip-attached
// https://docs.aws.amazon.com/config/latest/developerguide/eip-attached.html

export function requireEbsEncryption(name: string, kmsKeyId?: string): Policy {
    return {
        name: name,
        description: "Checks whether the EBS volumes are encrypted.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: typedRule(aws.ebs.Volume.isInstance, it => {
            assert.isTrue(it.encrypted);
            if (kmsKeyId !== undefined) {
                assert.isTrue(it.kmsKeyId === kmsKeyId);
            }
        }),
    };
}

// TODO: elb-acm-certificate-required
// https://docs.aws.amazon.com/config/latest/developerguide/elb-acm-certificate-required.html

// TODO: elb-custom-security-policy-ssl-check
// https://docs.aws.amazon.com/config/latest/developerguide/elb-custom-security-policy-ssl-check.html

export function requireElbLogging(name: string, bucketName?: string): Policy {
    const assertElbLogs = (lb: {
        accessLogs?: {
            bucket: string;
            bucketPrefix?: string;
            enabled?: boolean;
            interval?: number;
        };
    }) => {
        assert.isTrue(lb.accessLogs !== undefined && lb.accessLogs.enabled === true);
        assert.isTrue(
            bucketName !== undefined &&
                lb.accessLogs !== undefined &&
                bucketName === lb.accessLogs.bucket,
        );
    };

    return {
        name: name,
        description:
            "Checks whether the Application Load Balancers and the Classic Load Balancers have " +
            "logging enabled.",
        tags: ["security"],
        enforcementLevel: "mandatory",
        rules: [
            typedRule(aws.elasticloadbalancing.LoadBalancer.isInstance, assertElbLogs),
            typedRule(aws.elasticloadbalancingv2.LoadBalancer.isInstance, assertElbLogs),
        ],
    };
}

// TODO: elb-predefined-security-policy-ssl-check
// https://docs.aws.amazon.com/config/latest/developerguide/elb-predefined-security-policy-ssl-check.html

// TODO: lambda-function-settings-check
// https://docs.aws.amazon.com/config/latest/developerguide/lambda-function-settings-check.html

// TODO: lambda-function-public-access-prohibited
// https://docs.aws.amazon.com/config/latest/developerguide/lambda-function-public-access-prohibited.html

// TODO: restricted-common-ports
// https://docs.aws.amazon.com/config/latest/developerguide/restricted-common-ports.html

// TODO: restricted-ssh
// https://docs.aws.amazon.com/config/latest/developerguide/restricted-ssh.html

function toStringSet(ss: string | Iterable<string>): Set<string>;
function toStringSet(ss?: string | Iterable<string>): Set<string> | undefined;
function toStringSet(ss: any): Set<string> | undefined {
    return ss === undefined ? undefined : typeof ss === "string" ? new Set([ss]) : new Set(...ss);
}