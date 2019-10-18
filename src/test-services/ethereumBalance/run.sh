#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

docker build -t ethereum-balance . > /dev/null

docker run --network blockchain_home --rm --env-file ".env.$TARGET_NETWORK" ethereum-balance $@
