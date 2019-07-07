#!/bin/bash

set -e

cd $(dirname "$0")

echo "Starting side test blockchain"

rm -rf ./ganache_data_side

mkdir ganache_data_side

kill $(lsof -t -i:3333) > /dev/null 2>&1 || true

ganache-cli --db ./ganache_data_side -p 3333 -m "shrug dwarf easily blade trigger lucky reopen cage lake scatter desk boat" -i 33 -q &

echo "Starting home test blockchain"

rm -rf ./ganache_data

mkdir ganache_data

kill $(lsof -t -i:4444) > /dev/null 2>&1 || true

ganache-cli -a 20 --db ./ganache_data -p 4444 -m "shrug dwarf easily blade trigger lucky reopen cage lake scatter desk boat" -i 44 -q &

sleep 4

echo "Deploying erc20"

cd ../src/deploy/deploy-test

truffle deploy --network development --reset > /dev/null

echo "Deploying home part"

cd ../deploy-home

truffle deploy --network development --reset > /dev/null

echo "Deploying side part"

cd ../deploy-side

truffle deploy --network development --reset > /dev/null

echo "Done"
