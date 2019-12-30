#!/bin/bash

set -e

trap cleanup EXIT

cd $(dirname "$0")

cleanup() {
  # Kill the ganache instance that we started (if we started one and if it's still running).
  if [[ -n "$ganache_pid" ]] && ps -p "$ganache_pid" > /dev/null; then
    kill -9 "$ganache_pid"
  fi
}

PROJECT_ROOT_DIR=$(dirname "`dirname "$(pwd)"`")
cd "$1"

mnemonic="shrug dwarf easily blade trigger lucky reopen cage lake scatter desk boat"
if [[ -z "$COVERAGE" ]]; then
    echo "Starting ganache-cli"
    "$PROJECT_ROOT_DIR/node_modules/.bin/ganache-cli" \
    --gasLimit 8000000 \
    -m "$mnemonic" \
    -i 55 \
    > /dev/null &
else
    echo "Starting testrpc-sc"
    "$PROJECT_ROOT_DIR/node_modules/.bin/testrpc-sc" \
    --gasLimit 0xfffffffffff \
    --allowUnlimitedContractSize \
    -m "$mnemonic" \
    -i 55 \
    > /dev/null &
fi
ganache_pid=$!

echo "Running tests for $1"

if [[ -z "$COVERAGE" ]]; then
    "$PROJECT_ROOT_DIR/node_modules/.bin/truffle" test --network test
else
    "$PROJECT_ROOT_DIR/node_modules/.bin/solidity-coverage"
fi
