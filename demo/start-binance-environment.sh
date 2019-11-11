#!/bin/bash

set -e

cd $(dirname "$0")

tbnbcli() {
    echo 12345678 | docker exec -i binance-testnet_node_1 ./tbnbcli $@ --from node0 --node http://node:26657 --chain-id Binance-Dev --json
}

echo "Removing old environment"
docker kill $(docker ps -a | grep binance-testnet_ | awk '{print $1}') > /dev/null 2>&1 || true
docker rm $(docker ps -a | grep binance-testnet_ | awk '{print $1}') > /dev/null 2>&1 || true
docker volume rm binance-testnet_marketdata > /dev/null 2>&1 || true

docker network create binance_net > /dev/null 2>&1 || true

echo "Building required binaries"
docker build -t testnet-binaries ../src/binance-testnet > /dev/null 2>&1 || true

echo "Running environment"
docker-compose -f ../src/binance-testnet/docker-compose.yml up --build -d

sleep 2

echo "Issuing test asset"
ISSUED_LOG=$(tbnbcli token issue --symbol DEV --total-supply 1000000000000 --token-name "DEV Token" | jq .Response.log)
TOKEN_SYMBOL=${ISSUED_LOG:(-8):7}
echo "Issued $TOKEN_SYMBOL"

sed -i 's/FOREIGN_ASSET=.*$/FOREIGN_ASSET='"$TOKEN_SYMBOL"'/' ../src/test-services/binanceBalance/.env.development
sed -i 's/FOREIGN_ASSET=.*$/FOREIGN_ASSET='"$TOKEN_SYMBOL"'/' ../src/test-services/binanceSend/.env.development
sed -i 's/FOREIGN_ASSET=.*$/FOREIGN_ASSET='"$TOKEN_SYMBOL"'/' ../tests/.env
for file in ./validator*/.env.development; do
    sed -i 's/FOREIGN_ASSET=.*$/FOREIGN_ASSET='"$TOKEN_SYMBOL"'/' "$file"
done

sleep 2

echo "Sending tokens to controlled address"
tbnbcli token multi-send --transfers '[{"to":"tbnb1z7u9f8mcuwxanns9xa6qgjtlka0d392epc0m9x","amount":"1000000000000:BNB,1000000000000:'"$TOKEN_SYMBOL"'"}]'

sleep 2