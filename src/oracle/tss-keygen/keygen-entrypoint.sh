#!/bin/bash

set -e

echo "Connecting to $1"

until curl "$1" > /dev/null 2>&1; do
    sleep 1;
done

#curl "$1"

echo "Generating key using server $1"

./gg18_keygen_client "$1" keys.store

echo "Generated keys for all parties"

echo "Signing message"

if [[ -z "$SKIP_SIGN" ]]; then

    ./gg18_sign_client "$1" keys.store some_message

    echo "Signed message"

fi
