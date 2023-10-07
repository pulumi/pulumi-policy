// Copyright 2016-2020, Pulumi Corporation.
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

import * as policy from "../policy";

/** @internal */
export type MochaFunc = (err: Error) => void;

// A helper function for wrapping some of the boilerplate goo necessary to interface between Mocha's asynchronous
// testing and our TypeScript async tests.
/** @internal */
export function asyncTest(test: () => Promise<void>): (func: MochaFunc) => void {
    return (done: (err: any) => void) => {
        const go = async () => {
            let caught: Error | undefined;
            try {
                await test();
            }
            catch (err) {
                caught = err;
            }
            finally {
                done(caught);
            }
        };
        go();
    };
}

/** @internal */
export interface PolicyViolation {
    message: string;
    urn?: string;
}

// runResourcePolicy will run some basic checks for a policy's metadata, and then
// execute its rules with the provided type and properties.
/** @internal */
export async function runResourcePolicy(resPolicy: policy.ResourceValidationPolicy, args: policy.ResourceValidationArgs): Promise<PolicyViolation[]> {
    const violations: PolicyViolation[] = [];
    const report = (message: string, urn?: string) => {
        violations.push({ message: message, ...urn && { urn } });
    };
    const validations = Array.isArray(resPolicy.validateResource)
        ? resPolicy.validateResource
        : [resPolicy.validateResource];
    for (const validation of validations) {
        if (validation) {
            await Promise.resolve(validation(args, report));
        }
    }
    return violations;
}

export type PolicyRemediation = Record<string, any> | undefined;

// runResourceRemediation will run some basic checks for a policy's metadata, and then
// execute its remediations with the provided type and properties, returning the results.
/** @internal */
export async function runResourceRemediation(resPolicy: policy.ResourceValidationPolicy, args: policy.ResourceValidationArgs): Promise<PolicyRemediation> {
    if (resPolicy.remediateResource) {
        const result = await Promise.resolve(resPolicy.remediateResource(args));
        if (result) {
            return result;
        }
    }
    return undefined;
}

// runStackPolicy will run some basic checks for a policy's metadata, and then
// execute its rules with the provided type and properties.
/** @internal */
export async function runStackPolicy(stackPolicy: policy.StackValidationPolicy, args: policy.StackValidationArgs): Promise<PolicyViolation[]> {
    const violations: PolicyViolation[] = [];
    const report = (message: string, urn?: string) => {
        violations.push({ message: message, ...urn && { urn } });
    };
    await Promise.resolve(stackPolicy.validateStack(args, report));
    return violations;
}
