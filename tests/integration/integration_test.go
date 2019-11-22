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

	stackName := fmt.Sprintf("%s-%d", testDirName, time.Now().Unix()%100000)

	// Copy the root directory to /tmp and run various operations within that directory.
	e := ptesting.NewEnvironment(t)
	defer func() {
		if !t.Failed() {
			e.DeleteEnvironment()
		}
	}()
	e.ImportDirectory(rootDir)

	// Change to the Policy Pack directory.
	const packDirName = "policy-pack"
	packDir := path.Join(e.RootPath, packDirName)
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
		scenarioNum := idx + 1
		t.Run(fmt.Sprintf("Scenario_%d", scenarioNum), func(t *testing.T) {
			e.T = t

			e.RunCommand("pulumi", "config", "set", "scenario", fmt.Sprintf("%d", scenarioNum))

			// For even numbered scenarios, pass a relative path to --policy-pack, to get some
			// coverage of passing relative paths.
			policyPackArg := packDir
			if scenarioNum%2 == 0 {
				policyPackArg = path.Join("..", packDirName)
			}

			cmd := "pulumi"
			args := []string{"up", "--policy-pack", policyPackArg}
			if runtime == Python {
				cmd = "pipenv"
				args = append([]string{"run", "pulumi"}, args...)
			}

			if len(scenario.WantErrors) == 0 {
				t.Log("No errors are expected.")
				e.RunCommand(cmd, args...)
			} else {
				stdout, stderr := e.RunCommandExpectError(cmd, args...)

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
				"pulumi-nodejs:dynamic:Resource (a):",
				"  mandatory: [dynamic-no-state-with-value-1] Prohibits setting state to 1 on dynamic resources.",
				"  'state' must not have the value 1.",
			},
		},
		// Test scenario 4: violates the second policy.
		{
			WantErrors: []string{
				"pulumi-nodejs:dynamic:Resource (b):",
				"  mandatory: [dynamic-no-state-with-value-2] Prohibits setting state to 2 on dynamic resources.",
				"  'state' must not have the value 2.",
			},
		},
		// Test scenario 5: violates the first validation function of the third policy.
		{
			WantErrors: []string{
				"pulumi-nodejs:dynamic:Resource (c):",
				"  mandatory: [dynamic-no-state-with-value-3-or-4] Prohibits setting state to 3 or 4 on dynamic resources.",
				"  'state' must not have the value 3.",
			},
		},
		// Test scenario 6: violates the second validation function of the third policy.
		{
			WantErrors: []string{
				"pulumi-nodejs:dynamic:Resource (d):",
				"  mandatory: [dynamic-no-state-with-value-3-or-4] Prohibits setting state to 3 or 4 on dynamic resources.",
				"  'state' must not have the value 4.",
			},
		},
		// Test scenario 7: violates the fourth policy.
		{
			WantErrors: []string{
				"random:index:RandomUuid (r1):",
				"  mandatory: [randomuuid-no-keepers] Prohibits creating a RandomUuid without any 'keepers'.",
				"  RandomUuid must not have an empty 'keepers'.",
			},
		},
		// Test scenario 8: no violations.
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
				"random:index:RandomUuid (r1):",
				"  mandatory: [randomuuid-no-keepers] Prohibits creating a RandomUuid without any 'keepers'.",
				"  RandomUuid must not have an empty 'keepers'.",
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
				"  mandatory: [dynamic-no-state-with-value-1] Prohibits setting state to 1 on dynamic resources.",
				"  'state' must not have the value 1.",
			},
		},
		// Test scenario 4: violates the second policy.
		{
			WantErrors: []string{
				"  mandatory: [dynamic-no-state-with-value-2] Prohibits setting state to 2 on dynamic resources.",
				"  'state' must not have the value 2.",
			},
		},
	})
}
