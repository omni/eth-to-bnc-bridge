#!/bin/bash

set -e

docker build -t tests ./tests

set -a
source ./demo/validator1/.env.development
set +a

docker rm tests || true
docker create --name tests \
    -e HOME_RPC_URL \
    -e FOREIGN_URL \
    -e HOME_BRIDGE_ADDRESS \
    -e HOME_TOKEN_ADDRESS \
    -e FOREIGN_PRIVATE_KEY \
    -e FOREIGN_ASSET \
    tests $@

docker network connect blockchain_home tests
docker network connect validator1_test_network tests
docker network connect validator2_test_network tests
docker network connect validator3_test_network tests

docker start -a tests || true

docker cp "tests:/tests/results.xml" "./tests/results.xml" || true
docker rm tests || true
