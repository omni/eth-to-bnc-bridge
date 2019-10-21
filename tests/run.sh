#!/bin/bash

set -e

cd $(dirname "$0")

docker build -t tests . > /dev/null

docker run --network blockchain_home --rm -e HOME_RPC_URL tests $@
