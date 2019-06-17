PROJECT_NAME := policy
NODE_MODULE_NAME := @pulumi/policy
include ../../build/common.mk

VERSION := $(shell ../../scripts/get-version)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

TESTPARALLELISM := 10

build::
	yarn install
	rm -rf bin/
	tsc
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json > bin/package.json
	cp ../../README.md ../../LICENSE bin/
	node ../../scripts/reversion.js bin/version.js ${VERSION}

lint::
	tslint -c ../tslint.json -p tsconfig.json
