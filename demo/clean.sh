#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

echo "Cleaning $TARGET_NETWORK network"

if [[ "$TARGET_NETWORK" == "development" ]]; then
  docker volume rm ganache_side_data > /dev/null 2>&1 || true
  docker volume rm ganache_home_data > /dev/null 2>&1 || true
fi

for (( I = 1; I < 4; ++I )); do
    DIRNAME="validator$I"
    rm -rf "$DIRNAME/$TARGET_NETWORK"
    mkdir -p "$DIRNAME/$TARGET_NETWORK/db"
    mkdir -p "$DIRNAME/$TARGET_NETWORK/queue"
    mkdir -p "$DIRNAME/$TARGET_NETWORK/keys"
done
