#!/bin/bash
# publish.sh builds and publishes a release.
set -o nounset -o errexit -o pipefail
ROOT=$(dirname $0)/..

echo "Publishing Pip package to pypi.org:"
twine upload \
    -u pulumi -p "${PYPI_PASSWORD}" \
    "${ROOT}/sdk/python/env/src/dist"/*.whl \
    --skip-existing \
