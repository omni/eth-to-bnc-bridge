#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

docker build -t binance-send . > /dev/null

docker run --rm --env-file ".env.$TARGET_NETWORK" --env-file "../keys.$TARGET_NETWORK" binance-send $@
