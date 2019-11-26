#!/bin/bash

set -e
set -o allexport

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

DCU_FLAGS="--build --force-recreate"
NAME="validator$N"

cd $(dirname "$0")

echo "Starting $NAME in $TARGET_NETWORK network"

mkdir -p "$NAME"
cd "$NAME"

# load private key form git ignored .keys file
if [[ "$TARGET_NETWORK" == "staging" ]]; then
    source ".keys.$TARGET_NETWORK"
fi
# load env for particular environment
source ".env.$TARGET_NETWORK"

docker-compose -p "$NAME" -f ../../src/oracle/docker-compose-test.yml up ${DCU_FLAGS} $@
