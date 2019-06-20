#!/bin/bash

set -e

cd $(dirname "$0")

set -o allexport
source ../.env
set +o allexport

echo Writing params
echo \{\"parties\":\""$PARTIES"\",\"threshold\":\""$THRESHOLD"\"\} > ./params

if [[ -z "$LOCAL" ]]; then
    echo Building tss source from git
    docker build -t tss ../../tss > /dev/null
else
    echo Building tss local source
    docker build -t tss -f ../../tss/Dockerfile-local ../../tss > /dev/null
fi

echo Building tss keygen client
docker build -t tss-keygen-client . > /dev/null

touch ../"$KEY_FILE"

echo Generating keys using ssm server at "$SSM_URL"
docker run --rm -v "$(cd ..; pwd)/$KEY_FILE:/tss/keys.store" --network host tss-keygen-client "$SSM_URL"

echo ==========================================================

echo All keys generated, ready to test sign

if [[ -z "$SKIP_SIGN" ]]; then
    sleep 3

    SKIP_ENV=true ../tss-client/sign.sh test_message

    echo Signed successful
fi
