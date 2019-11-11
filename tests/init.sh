#!/bin/bash

set -e

echo "Cleaning previous demo environment"
./demo/clean.sh

echo "Killing all remaining validator docker containers"
docker kill $(docker ps | grep validator[1-3]_ | awk '{print $1}') > /dev/null 2>&1
docker rm $(docker ps | grep validator[1-3]_ | awk '{print $1}') > /dev/null 2>&1

echo "Building tss clients"
docker build -t tss ./src/tss

echo "Starting ethereum test networks"
BLOCK_TIME=3 ./demo/start-ethereum-environment.sh
echo "Starting binance test network"
./demo/start-binance-environment.sh

echo "Prefunding ethereum user accounts"
cat ./tests/config.json | jq .users[].ethAddress | xargs -I {} ./src/test-services/ethereumSend/run.sh {} 300
echo "Prefunding binance user accounts"
cat ./tests/config.json | jq .users[].bncAddress | xargs -I {} ./src/test-services/binanceSend/run.sh {} 300 0.1

echo "Starting validator daemons"
N=1 ./demo/validator-demo.sh -d
N=2 ./demo/validator-demo.sh -d
N=3 ./demo/validator-demo.sh -d

echo "Waiting until validators are ready"
until curl -X GET http://localhost:5001 > /dev/null 2>&1; do sleep 1; done
until curl -X GET http://localhost:5002 > /dev/null 2>&1; do sleep 1; done
until curl -X GET http://localhost:5003 > /dev/null 2>&1; do sleep 1; done
