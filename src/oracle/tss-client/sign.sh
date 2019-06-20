#!/bin/bash

set -e

cd $(dirname "$0")

if [[ -z "$SKIP_ENV" ]]; then
    set -o allexport
    source ../.env
    set +o allexport
fi

echo Writing params
echo \{\"parties\":\""$PARTIES"\",\"threshold\":\""$THRESHOLD"\"\} > ./params

if [[ -z "$LOCAL" ]]; then
    echo Building tss source from git
    docker build -t tss ../../tss > /dev/null
else
    echo Building tss local source
    docker build -t tss -f ../../tss/Dockerfile-local ../../tss > /dev/null
fi

echo Building tss sign client
docker build -t tss-sign-client . > /dev/null

touch signature

echo Signing message using ssm server at "$SSM_URL"
docker run --rm -v "$(cd ..; pwd)/$KEY_FILE:/tss/keys.store" -v "$(pwd)/signature:/tss/signature" --network host tss-sign-client "$SSM_URL" keys.store "$1"

echo Signed message
