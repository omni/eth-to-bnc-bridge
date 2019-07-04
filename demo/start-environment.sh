#!/bin/bash

set -e

cd $(dirname "$0")

echo "Starting blockchain"

rm -r ./ganache_data

mkdir ganache_data

kill $(sudo lsof -t -i:7545)

ganache-cli --db ./ganache_data -p 7545 -m "shrug dwarf easily blade trigger lucky reopen cage lake scatter desk boat" -i 33 -q &

sleep 3

echo "Deploying erc20"

cd ../src/deploy-test

truffle deploy --network development --reset > /dev/null

echo "Deploying main part"

cd ../deploy

truffle deploy --network development --reset > /dev/null
