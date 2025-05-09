# Copyright 2016-2020, Pulumi Corporation.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""The Pulumi Policy Python SDK."""

from setuptools import setup, find_packages

VERSION = "1.0.0"

def readme():
    try:
        with open('README.md', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return "Pulumi's Policy Python SDK - Development Version"

setup(name='pulumi_policy',
      version=VERSION,
      description='Pulumi\'s Policy Python SDK',
      long_description=readme(),
      long_description_content_type='text/markdown',
      url='https://github.com/pulumi/pulumi-policy',
      license='Apache 2.0',
      packages=find_packages(exclude=("test*",)),
      package_data={
          'pulumi_policy': [
              'py.typed',
              'pulumi-plugin.json'
          ]
      },
      install_requires=[
          'pulumi>=3.157.0,<4.0.0',
          'protobuf~=4.21',
          'grpcio~=1.66.2',
          'setuptools>=61.0'
      ],
      zip_safe=False)
