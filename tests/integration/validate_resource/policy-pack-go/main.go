// Copyright 2016-2022, Pulumi Corporation.  All rights reserved.

package main

import (
	"fmt"
	policy "github.com/pulumi/pulumi-policy/sdk/go"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

func main() {
	if err := policy.Run(func(config *config.Config) error {
		//testScenario := config.RequireInt("scenario")

		if err := policy.Pack[policy.ResourceValidationPolicy](
			"validate-resource-test-policy",
			policy.Policies[policy.ResourceValidationPolicy]{
				{
					Name:             "dynamic-no-state-with-value-1",
					Description:      "Prohibits setting state to 1 on dynamic resources.",
					EnforcementLevel: policy.EnforcementLevel_Advisory,
					ValidationPolicy: func() policy.ResourceValidationPolicy {
						return func(args policy.ResourceValidationArgs,
							reportViolation policy.ReportViolation) {
							if args.Resource.Type == "pulumi-nodejs:dynamic:Resource" {
								fields := args.Resource.Properties.GetFields()
								if val, ok := fields["state"]; ok && val.GetNumberValue() == 1 {
									reportViolation("'state' must not have the value 1.", args.Resource.Urn)
								}
							}
						}
					},
				},
				{
					Name:             "dynamic-no-state-with-value-2",
					Description:      "Prohibits setting state to 2 on dynamic resources.",
					EnforcementLevel: policy.EnforcementLevel_Advisory,
					ValidationPolicy: func() policy.ResourceValidationPolicy {
						return func(args policy.ResourceValidationArgs,
							reportViolation policy.ReportViolation) {
							if args.Resource.Type == "pulumi-nodejs:dynamic:Resource" {
								fields := args.Resource.Properties.GetFields()
								if val, ok := fields["state"]; ok && val.GetNumberValue() == 2 {
									reportViolation("'state' must not have the value 2.", args.Resource.Urn)
								}
							}
						}
					},
				},
				{
					Name:             "dynamic-no-state-with-value-3-or-4",
					Description:      "Prohibits setting state to 3 or 4 on dynamic resources.",
					EnforcementLevel: policy.EnforcementLevel_Advisory,
					ValidationPolicy: func() policy.ResourceValidationPolicy {
						return func(args policy.ResourceValidationArgs, reportViolation policy.ReportViolation) {
							if args.Resource.Type == "pulumi-nodejs:dynamic:Resource" {
								fields := args.Resource.Properties.GetFields()
								if val, ok := fields["state"]; ok && val.GetNumberValue() == 3 {
									reportViolation("'state' must not have the value 3.", args.Resource.Urn)
								}
								if val, ok := fields["state"]; ok && val.GetNumberValue() == 4 {
									reportViolation("'state' must not have the value 4.", args.Resource.Urn)
								}
							}
						}
					},
				},
				{
					Name:             "randomuuid-no-keepers",
					Description:      "Prohibits creating a RandomUuid without any 'keepers'.",
					EnforcementLevel: policy.EnforcementLevel_Advisory,
					ValidationPolicy: func() policy.ResourceValidationPolicy {
						return func(args policy.ResourceValidationArgs,
							reportViolation policy.ReportViolation) {
							if args.Resource.Type == "random:index/randomUuid:RandomUuid" {
								fields := args.Resource.Properties.GetFields()
								if val, ok := fields["keepers"]; !ok || val.GetStringValue() == "" {
									reportViolation("RandomUuid must not have an empty 'keepers'.", args.Resource.Urn)
								}
							}
						}
					},
				},
				{
					Name:             "dynamic-no-state-with-value-5",
					Description:      "Prohibits setting state to 5 on dynamic resources.",
					EnforcementLevel: policy.EnforcementLevel_Advisory,
					ValidationPolicy: func() policy.ResourceValidationPolicy {
						return func(args policy.ResourceValidationArgs, reportViolation policy.ReportViolation) {
							if args.Resource.Type == "pulumi-nodejs:dynamic:Resource" {
								fields := args.Resource.Properties.GetFields()
								if val, ok := fields["state"]; ok && val.GetNumberValue() == 5 {
									reportViolation("'state' must not have the value 5.", args.Resource.Urn)
								}
							}
						}
					},
				},
				{
					Name:             "large-resource",
					Description:      "Ensures that large string properties are set properly.",
					EnforcementLevel: policy.EnforcementLevel_Advisory,
					ValidationPolicy: func() policy.ResourceValidationPolicy {
						return func(args policy.ResourceValidationArgs,
							reportViolation policy.ReportViolation) {
							if args.Resource.Type == "pulumi-nodejs:dynamic:Resource" {
								fields := args.Resource.Properties.GetFields()
								if val, ok := fields["state"]; ok && val.GetNumberValue() == 6 {
									str, ok := fields["longString"]
									if !ok {
										reportViolation("'state' 6 must have longString.", args.Resource.Urn)
									}
									l := len(str.GetStringValue())
									if l != 5*1024*1024 {
										reportViolation(fmt.Sprintf("'longString' had expected length of %d, got %d",
											5*1024*1024, l), args.Resource.Urn)
									}
								}
							}
						}
					},
				},
			}); err != nil {
			return err
		}

		return nil
	}); err != nil {
		panic(err)
	}
}
