#!/bin/bash

set -e

echo "Connecting to $1"

until curl "$1" > /dev/null 2>&1; do
    sleep 1;
done

echo "Fetching current tss params"

curl -X GET "$1/current_params" -o ./params > /dev/null 2>&1

echo "Signing message using server $1"

./gg18_sign_client "$1" "$2" "$3"

echo "Signed message"
