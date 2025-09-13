PROJECT_NAME := policy
NODE_MODULE_NAME := @pulumi/policy
include ../../../build/common.mk

VERSION := $(shell cd ../../../ && pulumictl get version --language javascript)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

TESTPARALLELISM := 10

ensure::
	yarn install

build:: ensure
	rm -rf bin/
	yarn run tsc
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json > bin/package.json
	cp ../../../README.md ../../../LICENSE bin/
	node ../../../scripts/reversion.js bin/version.js ${VERSION}

lint:: ensure
	yarn run eslint -c .eslintrc.js --ext .ts .

.PHONY: lint_fix
lint_fix:: ensure
	yarn run eslint -c .eslintrc.js --ext .ts --fix .

istanbul_tests:: build
	yarn run istanbul test --print none _mocha -- --timeout 15000 'bin/tests/**/*.spec.js'
	yarn run istanbul report text-summary
	yarn run istanbul report text

test_fast:: istanbul_tests

test_all:: istanbul_tests
