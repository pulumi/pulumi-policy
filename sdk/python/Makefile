PROJECT_NAME     := Pulumi Policy Python SDK
VERSION          := $(shell ../../scripts/get-py-version HEAD)

PYENV := ./env
PYENVSRC := $(PYENV)/src

include ../../build/common.mk

ensure::
	pipenv --python 3 install --dev
	mkdir -p $(PYENVSRC)

build::
	rm -rf $(PYENVSRC) && cp -R ./lib/. $(PYENVSRC)/
	sed -i.bak "s/\$${VERSION}/$(VERSION)/g" $(PYENVSRC)/setup.py && rm $(PYENVSRC)/setup.py.bak
	cp ../../README.md $(PYENVSRC)
	cd $(PYENVSRC) && pipenv run python setup.py build bdist_wheel --universal

lint::
	pipenv run mypy ./lib/pulumi_policy --config-file=mypy.ini
	pipenv run pylint ./lib/pulumi_policy --rcfile=.pylintrc

test_fast::
	pipenv run pip install ./env/src
	pipenv run python -m unittest discover -s lib/test -v

test_all:: test_fast
