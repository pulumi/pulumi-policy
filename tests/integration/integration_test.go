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

package integrationtests

import (
	"fmt"
	"os"
	"path"
	"strings"
	"testing"
	"time"

	ptesting "github.com/pulumi/pulumi/pkg/testing"
	"github.com/stretchr/testify/assert"
)

type Runtime int

const (
	NodeJS Runtime = iota
	Python
)

func abortIfFailed(t *testing.T) {
	if t.Failed() {
		t.Fatal("Aborting test as a result of unrecoverable error.")
	}
}

// policyTestScenario describes an iteration of the
type policyTestScenario struct {
	// WantErrors is the error message we expect to see in the command's output.
	WantErrors []string
	// Whether the error messages are advisory, and don't actually fail the operation.
	Advisory bool
}

// runPolicyPackIntegrationTest creates a new Pulumi stack and then runs through
// a sequence of test scenarios where a configuration value is set and then
// the stack is updated or previewed, confirming the expected result.
func runPolicyPackIntegrationTest(
	t *testing.T, testDirName string, runtime Runtime,
	initialConfig map[string]string, scenarios []policyTestScenario) {
	t.Logf("Running Policy Pack Integration Test from directory %q", testDirName)

	// Get the directory for the policy pack to run.
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Error getting working directory")
	}
	rootDir := path.Join(cwd, testDirName)

	// The Pulumi project name matches the test dir name in these tests.
	os.Setenv("PULUMI_TEST_PROJECT", testDirName)

	stackName := fmt.Sprintf("%s-%d", testDirName, time.Now().Unix()%100000)
	os.Setenv("PULUMI_TEST_STACK", stackName)

	// Copy the root directory to /tmp and run various operations within that directory.
	e := ptesting.NewEnvironment(t)
	defer func() {
		if !t.Failed() {
			e.DeleteEnvironment()
		}
	}()
	e.ImportDirectory(rootDir)

	// Change to the Policy Pack directory.
	packDir := path.Join(e.RootPath, "policy-pack")
	e.CWD = packDir

	// Get dependencies.
	e.RunCommand("yarn", "install")
	abortIfFailed(t)

	// Link @pulumi/policy.
	e.RunCommand("yarn", "link", "@pulumi/policy")
	abortIfFailed(t)

	// Change to the Pulumi program directory.
	programDir := path.Join(e.RootPath, "program")
	e.CWD = programDir

	// Create the stack.
	e.RunCommand("pulumi", "login", "--local")
	abortIfFailed(t)

	e.RunCommand("pulumi", "stack", "init", stackName)
	abortIfFailed(t)

	// Get dependencies.
	switch runtime {
	case NodeJS:
		e.RunCommand("yarn", "install")
		abortIfFailed(t)

	case Python:
		e.RunCommand("pipenv", "--python", "3")
		abortIfFailed(t)
		e.RunCommand("pipenv", "run", "pip", "install", "-r", "requirements.txt")
		abortIfFailed(t)
	default:
		t.Fatalf("Unexpected runtime value.")
	}

	// Initial configuration.
	for k, v := range initialConfig {
		e.RunCommand("pulumi", "config", "set", k, v)
	}

	// After this point, we want be sure to cleanup the stack, so we don't accidentally leak
	// any cloud resources.
	defer func() {
		t.Log("Cleaning up Stack")
		e.RunCommand("pulumi", "destroy", "--yes")
		e.RunCommand("pulumi", "stack", "rm", "--yes")
	}()

	assert.True(t, len(scenarios) > 0, "no test scenarios provided")
	for idx, scenario := range scenarios {
		// Create a sub-test so go test will output data incrementally, which will let
		// a CI system like Travis know not to kill the job if no output is sent after 10m.
		// idx+1 to make it 1-indexed.
		t.Run(fmt.Sprintf("Scenario_%d", idx+1), func(t *testing.T) {
			e.T = t

			e.RunCommand("pulumi", "config", "set", "scenario", fmt.Sprintf("%d", idx+1))

			cmd := "pulumi"
			args := []string{"up", "--yes", "--policy-pack", packDir}
			if runtime == Python {
				cmd = "pipenv"
				args = append([]string{"run", "pulumi"}, args...)
			}

			if len(scenario.WantErrors) == 0 {
				t.Log("No errors are expected.")
				e.RunCommand(cmd, args...)
			} else {
				var stdout, stderr string
				if scenario.Advisory {
					stdout, stderr = e.RunCommand(cmd, args...)
				} else {
					stdout, stderr = e.RunCommandExpectError(cmd, args...)
				}

				for _, wantErr := range scenario.WantErrors {
					inSTDOUT := strings.Contains(stdout, wantErr)
					inSTDERR := strings.Contains(stderr, wantErr)

					if !inSTDOUT && !inSTDERR {
						t.Errorf("Did not find expected error %q", wantErr)
					}
				}

				if t.Failed() {
					t.Logf("Command output:\nSTDOUT:\n%v\n\nSTDERR:\n%v\n\n", stdout, stderr)
				}
			}
		})
	}

	e.T = t
	t.Log("Finished test scenarios.")
	// Cleanup already registered via defer.
}

// Test policy name validation.
func TestInvalidPolicyName(t *testing.T) {
	runPolicyPackIntegrationTest(t, "invalid_policy_name", NodeJS, nil, []policyTestScenario{
		{
			WantErrors: []string{`Invalid policy name "all". "all" is a reserved name.`},
		},
	})
}

// Test basic resource validation.
func TestValidateResource(t *testing.T) {
	runPolicyPackIntegrationTest(t, "validate_resource", NodeJS, nil, []policyTestScenario{
		// Test scenario 1: no resources.
		{
			WantErrors: nil,
		},
		// Test scenario 2: no violations.
		{
			WantErrors: nil,
		},
		// Test scenario 3: violates the first policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-resource-test-policy v0.0.1  dynamic-no-state-with-value-1 (a)",
				"Prohibits setting state to 1 on dynamic resources.",
				"'state' must not have the value 1.",
			},
		},
		// Test scenario 4: violates the second policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-resource-test-policy v0.0.1  dynamic-no-state-with-value-2 (b)",
				"Prohibits setting state to 2 on dynamic resources.",
				"'state' must not have the value 2.",
			},
		},
		// Test scenario 5: violates the first validation function of the third policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-resource-test-policy v0.0.1  dynamic-no-state-with-value-3-or-4 (c)",
				"Prohibits setting state to 3 or 4 on dynamic resources.",
				"'state' must not have the value 3.",
			},
		},
		// Test scenario 6: violates the second validation function of the third policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-resource-test-policy v0.0.1  dynamic-no-state-with-value-3-or-4 (d)",
				"Prohibits setting state to 3 or 4 on dynamic resources.",
				"'state' must not have the value 4.",
			},
		},
		// Test scenario 7: violates the fourth policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-resource-test-policy v0.0.1  randomuuid-no-keepers (r1)",
				"Prohibits creating a RandomUuid without any 'keepers'.",
				"RandomUuid must not have an empty 'keepers'.",
			},
		},
		// Test scenario 8: no violations.
		{
			WantErrors: nil,
		},
		// Test scenario 9: violates the fifth policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-resource-test-policy v0.0.1  dynamic-no-state-with-value-5 (e)",
				"Prohibits setting state to 5 on dynamic resources.",
				"'state' must not have the value 5.",
			},
		},
		// Test scenario 10: no violations.
		{
			WantErrors: nil,
		},
	})
}

// Test basic resource validation of a Python program.
func TestValidatePythonResource(t *testing.T) {
	runPolicyPackIntegrationTest(t, "validate_python_resource", Python, nil, []policyTestScenario{
		// Test scenario 1: violates the policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-resource-test-policy v0.0.1  randomuuid-no-keepers (r1)",
				"Prohibits creating a RandomUuid without any 'keepers'.",
				"RandomUuid must not have an empty 'keepers'.",
			},
		},
		// Test scenario 2: no violations.
		{
			WantErrors: nil,
		},
	})
}

// Test basic stack validation.
func TestValidateStack(t *testing.T) {
	runPolicyPackIntegrationTest(t, "validate_stack", NodeJS, nil, []policyTestScenario{
		// Test scenario 1: no resources.
		{
			WantErrors: nil,
		},
		// Test scenario 2: no violations.
		{
			WantErrors: nil,
		},
		// Test scenario 3: violates the first policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-stack-test-policy v0.0.1  dynamic-no-state-with-value-1",
				"Prohibits setting state to 1 on dynamic resources.",
				"'state' must not have the value 1.",
			},
		},
		// Test scenario 4: violates the second policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-stack-test-policy v0.0.1  dynamic-no-state-with-value-2",
				"Prohibits setting state to 2 on dynamic resources.",
				"'state' must not have the value 2.",
			},
		},
		// Test scenario 5: violates the third policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-stack-test-policy v0.0.1  dynamic-no-state-with-value-3 (c)",
				"Prohibits setting state to 3 on dynamic resources.",
				"'state' must not have the value 3.",
			},
		},
		// Test scenario 6: violates the fourth policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-stack-test-policy v0.0.1  randomuuid-no-keepers",
				"Prohibits creating a RandomUuid without any 'keepers'.",
				"RandomUuid must not have an empty 'keepers'.",
			},
		},
		// Test scenario 7: violates the fifth policy.
		{
			WantErrors: []string{
				"[mandatory]  validate-stack-test-policy v0.0.1  no-randomstrings",
				"Prohibits RandomString resources.",
				"RandomString resources are not allowed.",
			},
		},
		// Test scenario 8: no violations.
		{
			WantErrors: nil,
		},
		// Test scenario 9: no violations.
		{
			WantErrors: nil,
		},
	})
}

// Test that accessing unknown values returns an error during previews.
func TestUnknownValues(t *testing.T) {
	runPolicyPackIntegrationTest(t, "unknown_values", NodeJS, map[string]string{
		"aws:region": "us-west-2",
	}, []policyTestScenario{
		{
			WantErrors: []string{
				"[advisory]  unknown-values-policy v0.0.1  unknown-values-resource-validation (pet)",
				"can't run policy 'unknown-values-resource-validation' during preview: string value at .prefix can't be known during preview",
				"[advisory]  unknown-values-policy v0.0.1  unknown-values-stack-validation",
				"can't run policy 'unknown-values-stack-validation' during preview: string value at .prefix can't be known during preview",
			},
			Advisory: true,
		},
	})
}

// Test runtime data (Config, getStack, getProject, and isDryRun) is available to the Policy Pack.
func TestRuntimeData(t *testing.T) {
	runPolicyPackIntegrationTest(t, "runtime_data", NodeJS, map[string]string{
		"aConfigValue": "this value is a value",
		"aws:region":   "us-west-2",
	}, []policyTestScenario{{WantErrors: nil}})
}

// Test resource options.
func TestResourceOptions(t *testing.T) {
	runPolicyPackIntegrationTest(t, "resource_options", NodeJS, nil, []policyTestScenario{
		// Test scenario 1: test resource options.
		{WantErrors: nil},
		// Test scenario 2: prepare for destroying the stack (unprotect protected resources).
		{WantErrors: nil},
	})
}

// Test parent and dependencies.
func TestParentDependencies(t *testing.T) {
	runPolicyPackIntegrationTest(t, "parent_dependencies", NodeJS, nil, []policyTestScenario{
		{WantErrors: nil},
	})
}

// Test provider.
func TestProvider(t *testing.T) {
	runPolicyPackIntegrationTest(t, "provider", NodeJS, nil, []policyTestScenario{
		{WantErrors: nil},
	})
}

// Test Policy Packs with enforcement levels set on the Policy Pack and individual policies.
func TestEnforcementLevel(t *testing.T) {
	runPolicyPackIntegrationTest(t, "enforcementlevel", NodeJS, nil, []policyTestScenario{
		// Test scenario 1: Policy Pack: advisory; Policy: advisory.
		{
			WantErrors: []string{
				"[advisory]  enforcementlevel-advisory-advisory-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[advisory]  enforcementlevel-advisory-advisory-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
			Advisory: true,
		},
		// Test scenario 2: Policy Pack: advisory; Policy: disabled.
		{
			WantErrors: nil,
		},
		// Test scenario 3: Policy Pack: advisory; Policy: mandatory.
		{
			WantErrors: []string{
				"[mandatory]  enforcementlevel-advisory-mandatory-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[mandatory]  enforcementlevel-advisory-mandatory-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
		},
		// Test scenario 4: Policy Pack: advisory; Policy: not set.
		{
			WantErrors: []string{
				"[advisory]  enforcementlevel-advisory-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[advisory]  enforcementlevel-advisory-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
			Advisory: true,
		},
		// Test scenario 5: Policy Pack: disabled; Policy: advisory.
		{
			WantErrors: []string{
				"[advisory]  enforcementlevel-disabled-advisory-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[advisory]  enforcementlevel-disabled-advisory-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
			Advisory: true,
		},
		// Test scenario 6: Policy Pack: disabled; Policy: disabled.
		{
			WantErrors: nil,
		},
		// Test scenario 7: Policy Pack: disabled; Policy: mandatory.
		{
			WantErrors: []string{
				"[mandatory]  enforcementlevel-disabled-mandatory-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[mandatory]  enforcementlevel-disabled-mandatory-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
		},
		// Test scenario 8: Policy Pack: disabled; Policy: not set.
		{
			WantErrors: nil,
		},
		// Test scenario 9: Policy Pack: mandatory; Policy: advisory.
		{
			WantErrors: []string{
				"[advisory]  enforcementlevel-mandatory-advisory-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[advisory]  enforcementlevel-mandatory-advisory-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
			Advisory: true,
		},
		// Test scenario 10: Policy Pack: mandatory; Policy: disabled.
		{
			WantErrors: nil,
		},
		// Test scenario 11: Policy Pack: mandatory; Policy: mandatory.
		{
			WantErrors: []string{
				"[mandatory]  enforcementlevel-mandatory-mandatory-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[mandatory]  enforcementlevel-mandatory-mandatory-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
		},
		// Test scenario 12: Policy Pack: mandatory; Policy: not set.
		{
			WantErrors: []string{
				"[mandatory]  enforcementlevel-mandatory-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[mandatory]  enforcementlevel-mandatory-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
		},
		// Test scenario 13: Policy Pack: not set; Policy: advisory.
		{
			WantErrors: []string{
				"[advisory]  enforcementlevel-none-advisory-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[advisory]  enforcementlevel-none-advisory-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
			Advisory: true,
		},
		// Test scenario 14: Policy Pack: not set; Policy: disabled.
		{
			WantErrors: nil,
		},
		// Test scenario 15: Policy Pack: not set; Policy: mandatory.
		{
			WantErrors: []string{
				"[mandatory]  enforcementlevel-none-mandatory-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[mandatory]  enforcementlevel-none-mandatory-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
		},
		// Test scenario 16: Policy Pack: not set; Policy: not set.
		{
			WantErrors: []string{
				"[advisory]  enforcementlevel-none-test-policy v0.0.1  validate-resource (str)",
				"Always reports a resource violation.",
				"validate-resource-violation-message",
				"[advisory]  enforcementlevel-none-test-policy v0.0.1  validate-stack",
				"Always reports a stack violation.",
				"validate-stack-violation-message",
			},
			Advisory: true,
		},
	})
}
