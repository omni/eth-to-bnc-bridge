#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

docker build -t binance-balance . > /dev/null

if [[ "$TARGET_NETWORK" == "development" ]]; then
    docker run --rm --network binance_net --env-file ".env.$TARGET_NETWORK" binance-balance $@
else
    docker run --rm --env-file ".env.$TARGET_NETWORK" binance-balance $@
fi