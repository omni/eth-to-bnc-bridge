#!/bin/bash

set -e

docker build -t tests ./tests

docker rm tests > /dev/null 2>&1 || true
docker create --name tests \
    --env-file ./tests/.env \
    tests $@

docker network connect binance_net tests
docker network connect blockchain_home tests
docker network connect blockchain_side tests
docker network connect validator1_test_network tests
docker network connect validator2_test_network tests
docker network connect validator3_test_network tests

docker start -a tests || true

docker cp "tests:/tests/results.xml" "./tests/results.xml" > /dev/null 2>&1 || true
docker rm tests > /dev/null 2>&1  || true
