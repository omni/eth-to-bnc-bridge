#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

docker build -t get-bridge-history . > /dev/null

if [[ "$TARGET_NETWORK" == "development" ]]; then
    docker create --rm --name get-bridge-history --env-file ".env.development" \
    -e "WITH_SIGNATURES=$WITH_SIGNATURES" \
    -e "START_BLOCK=$START_BLOCK" \
    -e "EPOCH=$EPOCH" \
    get-bridge-history $@ > /dev/null
    docker network connect ethereum_home_rpc_net get-bridge-history > /dev/null
    docker network connect ethereum_side_rpc_net get-bridge-history > /dev/null
    docker start -a get-bridge-history
else
    docker run --rm --env-file ".env.staging" \
    -e "WITH_SIGNATURES=$WITH_SIGNATURES" \
    -e "START_BLOCK=$START_BLOCK" \
    -e "EPOCH=$EPOCH" \
    get-bridge-history $@
fi

