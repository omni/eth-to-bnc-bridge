#!/bin/bash

set -e

cd $(dirname "$0")

set -o allexport
source ./.env
set +o allexport

echo Writing params
echo \{\"parties\":\""$PARTIES"\",\"threshold\":\""$THRESHOLD"\"\} > ./params

if [[ -z "$LOCAL" ]]; then
    echo Building tss source from git
    docker build -t tss ../tss > /dev/null
else
    echo Building tss local source
    docker build -t tss -f ../tss/Dockerfile-local ../tss > /dev/null
fi

echo Building tss keygen client
docker build -t tss-keygen-client ./tss-keygen > /dev/null

touch "$KEY_FILE"

docker-compose -f ./docker-compose-keygen.yml kill proxy

echo Running keygen
docker-compose -f ./docker-compose-keygen.yml up $@
