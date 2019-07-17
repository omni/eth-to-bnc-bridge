#!/bin/bash

set -e

DCU_FLAGS="--build --force-recreate"
NAME="validator$N"

cd $(dirname "$0")

echo "Starting $NAME"

mkdir -p "$NAME"
cd "$NAME"
docker-compose -p "$NAME" -f ../../src/oracle/docker-compose-test.yml up ${DCU_FLAGS}
