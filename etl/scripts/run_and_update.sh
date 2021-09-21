#!/usr/bin/env bash
set -euo pipefail
export NODE_OPTIONS=--max_old_space_size=8192

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

pushd "$SCRIPT_DIR/.."
./node_modules/.bin/swc-node src/index.ts build -o ../../etl-data
gsutil -m cp -r ../../etl-data/* gs://anirona-data/
gsutil -m setmeta -h "Content-Encoding:gzip" gs://anirona-data/**/*.json.gz
popd
