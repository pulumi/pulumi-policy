PROJECT_NAME := policy
SUB_PROJECTS := sdk/nodejs/policy
include build/common.mk

.PHONY: ensure
ensure::
	# Golang dependencies for the integration tests.
	go get -t -d ./tests/integration

.PHONY: publish_packages
publish_packages:
	$(call STEP_MESSAGE)
	./scripts/publish_packages.sh

.PHONY: check_clean_worktree
check_clean_worktree:
	$$(go env GOPATH)/src/github.com/pulumi/scripts/ci/check-worktree-is-clean.sh

.PHONY: test_all
test_all::
	go test ./tests/integration -v -timeout 30m

# The travis_* targets are entrypoints for CI.
.PHONY: travis_cron travis_push travis_pull_request travis_api
travis_cron: all
travis_push: only_build check_clean_worktree only_test publish_packages
travis_pull_request: all
travis_api: all
