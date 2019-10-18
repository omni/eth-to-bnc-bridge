#!/bin/bash

set -e

cd $(dirname "$0")

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

echo "Resetting block in redis"

docker network create redis_net > /dev/null 2>&1 || true
docker kill redis > /dev/null 2>&1 || true
docker rm redis > /dev/null 2>&1 || true
docker run --rm --network redis_net -d --name redis \
    -v "`pwd`/validator$N/$TARGET_NETWORK/db:/data" \
    -v "`dirname "$(pwd)"`/src/oracle/configs/redis.conf:/usr/local/etc/redis/redis.conf" \
    redis:5.0.5-alpine > /dev/null 2>&1 || true

../src/oracle/scripts/resetToBlock/run.sh redis_net $1

docker kill redis > /dev/null 2>&1 || true
