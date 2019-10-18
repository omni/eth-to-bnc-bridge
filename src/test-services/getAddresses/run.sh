#!/bin/bash

set -e

cd $(dirname "$0")

docker build -t get-addresses . > /dev/null

docker run --rm get-addresses $@
