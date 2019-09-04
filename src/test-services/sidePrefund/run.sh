#!/bin/bash

set -e

cd $(dirname "$0")

echo "Using $TARGET_NETWORK network"

docker build -t ethereum-send . > /dev/null

docker run --network blockchain_side --rm --env-file .env --env-file "../.env.$TARGET_NETWORK" ethereum-send $@
