#!/bin/bash

set -e

echo "Connecting to $1"

until curl "$1" > /dev/null 2>&1; do
    sleep 1;
done

echo "Signing message using server $1"

rm -f signature

./gg18_sign_client "$1" "$2" "$3"
