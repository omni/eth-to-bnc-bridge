#!/bin/bash

set -e
set -v

docker build -t tss ./src/tss

./demo/start-environment.sh

cat ./tests/config.json | jq .users[].ethAddress | xargs -I {} ./src/test-services/ethereumSend/run.sh {} 100
cat ./tests/config.json | jq .users[].bncAddress | xargs -I {} ./src/test-services/binanceSend/run.sh {} 100 0.1

N=1 ./demo/validator-demo.sh -d
N=2 ./demo/validator-demo.sh -d
N=3 ./demo/validator-demo.sh -d

until curl -X GET http://localhost:5001 > /dev/null 2>&1; do sleep 1; done
until curl -X GET http://localhost:5002 > /dev/null 2>&1; do sleep 1; done
until curl -X GET http://localhost:5003 > /dev/null 2>&1; do sleep 1; done
