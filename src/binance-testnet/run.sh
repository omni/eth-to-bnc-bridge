#!/bin/bash

set -e

docker network create binance_net > /dev/null 2>&1 || true
docker-compose up --build
