#!/bin/bash

set -e
set -v

docker build -t tests . > /dev/null

docker run --network blockchain_home --rm -e HOME_RPC_URL tests $@
