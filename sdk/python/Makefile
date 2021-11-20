PROJECT_NAME     := Pulumi Policy Python SDK
VERSION          := $(shell cd ../../ && pulumictl get version)
PYPI_VERSION     := $(shell cd ../../ && pulumictl get version --language python)

PYENV := ./env
PYENVSRC := $(PYENV)/src
PYENVSRCLIB := $(PYENVSRC)/pulumi_policy

include ../../build/common.mk

ensure::
	pipenv --python 3 install --dev
	mkdir -p $(PYENVSRC)

build::
	rm -rf $(PYENVSRC) && cp -R ./lib/. $(PYENVSRC)/
	sed -i.bak "s/\$${VERSION}/$(PYPI_VERSION)/g" $(PYENVSRC)/setup.py && rm $(PYENVSRC)/setup.py.bak
	sed -i.bak "s/\$${VERSION}/$(VERSION:v%=%)/g" $(PYENVSRCLIB)/version.py && rm $(PYENVSRCLIB)/version.py.bak

	cp ../../README.md $(PYENVSRC)
	cd $(PYENVSRC) && pipenv run python setup.py build bdist_wheel --universal

lint::
	pipenv run mypy ./lib/pulumi_policy --config-file=mypy.ini
	pipenv run pylint ./lib/pulumi_policy --rcfile=.pylintrc

test_fast::
	pipenv run pip install ./env/src
	pipenv run python -m unittest discover -s lib/test -v

test_all:: test_fast
