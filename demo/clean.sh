#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

echo "Cleaning $TARGET_NETWORK network"

if [[ "$TARGET_NETWORK" == "development" ]]; then
  rm -rf ganache_side_db
  rm -rf ganache_home_db
  mkdir ganache_side_db
  mkdir ganache_home_db
fi

for (( I = 1; I < 4; ++I )); do
    DIRNAME="validator$I"
    rm -rf "$DIRNAME/$TARGET_NETWORK"
    mkdir -p "$DIRNAME/$TARGET_NETWORK/db"
    mkdir -p "$DIRNAME/$TARGET_NETWORK/queue"
    mkdir -p "$DIRNAME/$TARGET_NETWORK/keys"
done
