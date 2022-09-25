PROJECT_NAME     := Pulumi Policy Go SDK

include ../../build/common.mk

ensure::
	go mod download

build::
	go build

lint::
	golangci-lint run -c .golangci.yml --timeout 5m

test_fast::
	go test

test_all:: test_fast
