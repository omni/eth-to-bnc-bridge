#!/bin/bash

set -e

echo "Connecting to $1"

until curl "$1" > /dev/null 2>&1; do
    sleep 1;
done

echo "Fetching next tss params"

curl -X GET "$1/next_params" -o ./params > /dev/null 2>&1

echo "Generating key using server $1"

./gg18_keygen_client "$1" "$2"

echo "Generated keys for all parties"

#echo "Sending confirmation"

#curl -X POST -H "Content-Type: application/json" -d @"$2" "$1/confirm" > /dev/null 2>&1
