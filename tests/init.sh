#!/bin/bash

set -e

echo "Cleaning previous demo environment"
./demo/clean.sh

echo "Building tss clients"
docker build -t tss ./src/tss

echo "Starting ethereum test networks"
BLOCK_TIME=3 ./demo/start-ethereum-environment.sh
echo "Starting binance test network"
./demo/start-binance-environment.sh

echo "Starting validator daemons"
N=1 ./demo/validator-demo.sh -d
N=2 ./demo/validator-demo.sh -d
N=3 ./demo/validator-demo.sh -d

echo "Waiting until validators are ready"
until curl -X GET http://localhost:5001/info > /dev/null 2>&1; do sleep 1; done
until curl -X GET http://localhost:5002/info > /dev/null 2>&1; do sleep 1; done
until curl -X GET http://localhost:5003/info > /dev/null 2>&1; do sleep 1; done
