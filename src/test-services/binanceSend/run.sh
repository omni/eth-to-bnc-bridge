#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

docker build -t binance-send . > /dev/null

if [[ "$TARGET_NETWORK" == "development" ]]; then
    docker run --rm --network binance_net --env-file ".env.$TARGET_NETWORK" -e "PRIVATE_KEY=$PRIVATE_KEY" binance-send $@
else
    docker run --rm --env-file ".env.$TARGET_NETWORK" --env-file "../.keys.$TARGET_NETWORK" -e "PRIVATE_KEY=$PRIVATE_KEY" binance-send $@
fi
