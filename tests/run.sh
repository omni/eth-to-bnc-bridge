#!/bin/bash

set -e

echo "Building tests main image"
docker build -t tests ./tests

echo "Creating tests container"
docker rm tests > /dev/null 2>&1 || true
docker create --name tests --env-file ./tests/.env tests $@

echo "Connecting tests container to test networks"
docker network connect binance_net tests
docker network connect ethereum_home_rpc_net tests
docker network connect ethereum_side_rpc_net tests
docker network connect validator1_test_network tests
docker network connect validator2_test_network tests
docker network connect validator3_test_network tests

echo "Starting tests"
docker start -a tests || true

echo "Saving test results"
docker cp "tests:/tests/results.xml" "./tests/results.xml" > /dev/null 2>&1 || true

echo "Killing all remaining docker containers"
docker kill $(docker ps | grep validator[1-3]_ | awk '{print $1}') > /dev/null 2>&1 || true
docker kill $(docker ps | grep ethereum-testnet_ | awk '{print $1}') > /dev/null 2>&1 || true
docker kill $(docker ps | grep binance-testnet_ | awk '{print $1}') > /dev/null 2>&1 || true
