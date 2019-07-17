#!/bin/bash

set -e

cd $(dirname "$0")

docker build -t binance-balance . > /dev/null

docker run --rm --env-file .env binance-balance $@
