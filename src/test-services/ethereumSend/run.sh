#!/bin/bash

set -e

cd $(dirname "$0")

docker build -t ethreum-send . > /dev/null

docker run --network blockchain_home --rm --env-file .env ethreum-send $@
