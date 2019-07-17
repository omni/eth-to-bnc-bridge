#!/bin/bash

set -e

cd $(dirname "$0")

docker build -t ethreum-balance . > /dev/null

docker run --network blockchain_home --rm --env-file .env ethreum-balance $@
