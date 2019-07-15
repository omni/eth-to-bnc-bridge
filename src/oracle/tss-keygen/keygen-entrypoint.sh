#!/bin/bash

set -e

echo "Connecting to $1"

until curl "$1" > /dev/null 2>&1; do
    sleep 1;
done

echo "Generating key using server $1"

./gg18_keygen_client "$1" "$2"

echo "Generated keys for all parties"
