#!/bin/bash

set -e

cd $(dirname "$0")

docker build -t reset-to-block . > /dev/null

docker run --rm --network $1 reset-to-block $2
