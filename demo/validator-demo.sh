#!/bin/bash

set -e
set -o allexport

DCU_FLAGS="--build --force-recreate"
NAME="validator$N"

cd $(dirname "$0")

echo "Starting $NAME"

mkdir -p "$NAME"
cd "$NAME"

# load private key form git ignored .keys file
if [[ -e .keys ]]; then
    source .keys
fi
# load env for particular environment
source ".env.$TARGET_NETWORK"

docker-compose -p "$NAME" -f ../../src/oracle/docker-compose-test.yml up ${DCU_FLAGS}
