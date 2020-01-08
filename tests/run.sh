#!/bin/bash

set -e

if [[ -z "$CI" ]]; then
    echo "Cleaning previous demo environment"
    ./demo/clean.sh

    if [[ -z "$(docker images -q tss 2> /dev/null)" ]]; then
        echo "Building tss clients"
        docker build -t tss ./src/tss &>/dev/null
    fi
fi

echo "Starting ethereum test networks"
BLOCK_TIME=3 ./demo/start-ethereum-environment.sh
echo "Starting binance test network"
./demo/start-binance-environment.sh

echo "Starting validator daemons"
N=1 ./demo/validator-demo.sh -d --build
N=2 ./demo/validator-demo.sh -d
N=3 ./demo/validator-demo.sh -d


echo "Waiting until validators are ready"
for (( I = 1; I < 4; ++I )); do
    if [[ -z "$CI" ]]; then
        until curl -X GET http://localhost:500"$I"/info &>/dev/null; do sleep 1; done
    else
        docker run \
            --network validator"$I"_test_network \
            --entrypoint ash \
            appropriate/curl:latest \
            -c "timeout -t 30 ash -c 'until curl -X GET http://proxy:8002/info &>/dev/null; do sleep 1; done'"
    fi
done

echo "Building tests main image"
docker build -t tests ./tests

echo "Creating tests container"
docker rm tests &>/dev/null || true
docker create --name tests --env-file ./tests/.env tests &>/dev/null

echo "Connecting tests container to test networks"
docker network connect binance_net tests
docker network connect ethereum_home_rpc_net tests
docker network connect ethereum_side_rpc_net tests
for (( I = 1; I < 4; ++I )); do
    docker network connect validator"$I"_test_network tests
done

echo "Starting tests"
res=0
docker start -a tests || res=$?

echo "Saving test results"
docker cp "tests:/tests/results.xml" "./tests/results.xml" &>/dev/null || true

if [[ -z "$CI" ]]; then
    echo "Killing all remaining docker containers"
    docker kill $(docker ps | grep validator[1-3]_ | awk '{print $1}') &>/dev/null || true
    docker kill $(docker ps | grep ethereum-testnet_ | awk '{print $1}') &>/dev/null || true
    docker kill $(docker ps | grep binance-testnet_ | awk '{print $1}') &>/dev/null || true
fi

exit "$res"
