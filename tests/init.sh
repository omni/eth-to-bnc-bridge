#!/bin/bash

set -e

./demo/start-environment.sh

echo "FOREIGN_PRIVATE_KEY=$FOREIGN_PRIVATE_KEY" > ./src/test-services/.keys.$TARGET_NETWORK

cat ./tests/config.json | jq .users[].bncAddress | xargs -I {} ./src/test-services/binanceSend/run.sh {} 100 0.1

N=1 ./demo/validator-demo.sh -d
N=2 ./demo/validator-demo.sh -d
N=3 ./demo/validator-demo.sh -d

until curl -X GET http://localhost:5001 > /dev/null 2>&1; do sleep 1; done
until curl -X GET http://localhost:5002 > /dev/null 2>&1; do sleep 1; done
until curl -X GET http://localhost:5003 > /dev/null 2>&1; do sleep 1; done
