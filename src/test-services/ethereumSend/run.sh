#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

docker build -t ethereum-send . > /dev/null

if [[ "$TARGET_NETWORK" == "development" ]]; then
    docker run --network ethereum_home_rpc_net --rm --env-file ".env.$TARGET_NETWORK" -e "PRIVATE_KEY=$PRIVATE_KEY" ethereum-send $@
else
    docker run --rm --env-file ".env.$TARGET_NETWORK" --env-file "../.keys.$TARGET_NETWORK" -e "PRIVATE_KEY=$PRIVATE_KEY" ethereum-send $@
fi
