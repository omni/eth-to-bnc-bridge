#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

echo "Cleaning $TARGET_NETWORK network"

docker kill $(docker ps | grep validator[1-3]_ | awk '{print $1}') > /dev/null 2>&1 || true
docker rm $(docker ps -a | grep validator[1-3]_ | awk '{print $1}') > /dev/null 2>&1 || true
docker kill ganache_home ganache_side > /dev/null 2>&1 || true
docker rm ganache_home ganache_side > /dev/null 2>&1 || true
docker kill $(docker ps | grep binance-testnet_ | awk '{print $1}') > /dev/null 2>&1 || true
docker rm $(docker ps -a | grep binance-testnet_ | awk '{print $1}') > /dev/null 2>&1 || true
docker kill $(docker ps | grep ethereum-testnet_ | awk '{print $1}') > /dev/null 2>&1 || true
docker rm $(docker ps -a | grep ethereum-testnet_ | awk '{print $1}') > /dev/null 2>&1 || true

if [[ "$TARGET_NETWORK" == "development" ]]; then
  docker volume rm ganache_side_data > /dev/null 2>&1 || true
  docker volume rm ganache_home_data > /dev/null 2>&1 || true
  docker volume rm binance_data > /dev/null 2>&1 || true
  docker volume rm binance_marketdata > /dev/null 2>&1 || true

  docker network rm ethereum_side_rpc_net > /dev/null 2>&1 || true
  docker network rm ethereum_home_rpc_net > /dev/null 2>&1 || true
  docker network rm binance_net > /dev/null 2>&1 || true
  docker network rm binance-testnet_binance_rpc_net > /dev/null 2>&1 || true
fi

docker network rm validator1_test_network > /dev/null 2>&1 || true
docker network rm validator2_test_network > /dev/null 2>&1 || true
docker network rm validator3_test_network > /dev/null 2>&1 || true

for (( I = 1; I < 4; ++I )); do
    DIRNAME="validator$I"
    rm -rf "$DIRNAME/$TARGET_NETWORK"
    mkdir -p "$DIRNAME/$TARGET_NETWORK/db"
    mkdir -p "$DIRNAME/$TARGET_NETWORK/queue"
    mkdir -p "$DIRNAME/$TARGET_NETWORK/keys"
done
