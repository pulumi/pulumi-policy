PROJECT_NAME := policy
NODE_MODULE_NAME := @pulumi/policy
include ../../../build/common.mk

VERSION := $(shell cd ../../../ && pulumictl get version --language javascript)

TESTPARALLELISM := 10

ensure::
	bun install

build:: ensure
	rm -rf bin/
	bun run tsc
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json > bin/package.json
	cp .npmignore ../../../README.md ../../../LICENSE bin/
	node ../../../scripts/reversion.js bin/version.js ${VERSION}

lint:: ensure
	bun run eslint -c .eslintrc.js --ext .ts .

.PHONY: lint_fix
lint_fix:: ensure
	bun run eslint -c .eslintrc.js --ext .ts --fix .

istanbul_tests:: build
	bun run istanbul test --print none _mocha -- --timeout 15000 'bin/tests/**/*.spec.js'
	bun run istanbul report text-summary
	bun run istanbul report text

test_fast:: istanbul_tests

test_all:: istanbul_tests
