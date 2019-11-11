#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

docker build -t binance-balance . > /dev/null

docker run --rm --network binance_net --env-file ".env.$TARGET_NETWORK" binance-balance $@
