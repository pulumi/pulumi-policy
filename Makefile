PROJECT_NAME := policy
SUB_PROJECTS := sdk/nodejs/policy sdk/python
include build/common.mk

.PHONY: ensure
ensure::
	# Golang dependencies for the integration tests.
	cd ./tests/integration && go mod download && go mod tidy

.PHONY: publish_packages
publish_packages:
	$(call STEP_MESSAGE)
	./scripts/publish_packages.sh

.PHONY: test_all
test_all::
	cd ./tests/integration && go test . -v -timeout 30m







