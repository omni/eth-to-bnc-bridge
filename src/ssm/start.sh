#!/bin/bash

set -e

cd $(dirname "$0")

set -o allexport
source ./.env
set +o allexport

echo Starting \{"$THRESHOLD","$PARTIES"\}-threshold ECDSA

echo Writing params
echo \{\"parties\":\""$PARTIES"\",\"threshold\":\""$THRESHOLD"\"\} > ./params

if [[ -z "$LOCAL" ]]; then
    echo Building tss source from git
    docker build -t tss ../tss > /dev/null
else
    echo Building tss local source
    docker build -t tss -f ../tss/Dockerfile-local ../tss > /dev/null
fi

echo Builing shared state machine
docker build -t ssm . > /dev/null

echo Running shared state machine
docker run -d -p "$PORT":8001 --rm ssm > /dev/null

sleep 1

echo Server started, listening on port "$PORT"
