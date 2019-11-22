#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

docker build -t ethereum-balance . > /dev/null

if [[ "$TARGET_NETWORK" == "development" ]]; then
    docker run --network ethereum_home_rpc_net --rm --env-file ".env.$TARGET_NETWORK" ethereum-balance $@
else
    docker run --rm --env-file ".env.$TARGET_NETWORK" ethereum-balance $@
fi
