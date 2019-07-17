#!/bin/bash

set -e

cd $(dirname "$0")

docker build -t binance-send . > /dev/null

docker run --rm --env-file .env binance-send $@
