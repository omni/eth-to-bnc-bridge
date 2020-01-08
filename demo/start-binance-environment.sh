#!/bin/bash

set -e

cd $(dirname "$0")

tbnbcli() {
    echo 12345678 | docker exec -i binance-testnet_node_1 ./tbnbcli $@ --from node0 --node http://node:26657 --chain-id Binance-Dev --json
}

if [[ "$(docker volume ls | grep binance_data)" ]]; then
    echo "Restarting binance test network"
else
    echo "Creating new binance test network"

    echo "Removing old environment"
    docker kill $(docker ps -a | grep binance-testnet_ | awk '{print $1}') &>/dev/null || true
    docker rm $(docker ps -a | grep binance-testnet_ | awk '{print $1}') &>/dev/null || true
    docker volume rm binance_marketdata &>/dev/null || true

    docker network create binance_net &>/dev/null || true
    docker volume create binance_marketdata &>/dev/null || true
    docker volume create binance_data &>/dev/null || true

    need_to_deploy=true
fi

echo "Building required binaries"
docker build -t testnet-binaries ../src/binance-testnet &>/dev/null

echo "Building binance test environment docker images"
docker-compose -f ../src/binance-testnet/docker-compose.yml build &>/dev/null
echo "Running environment"
docker-compose -f ../src/binance-testnet/docker-compose.yml up -d

if [[ -n "$need_to_deploy" ]]; then
    echo "Issuing test asset"
    TOKEN_SYMBOL=''
    while [[ -z "$TOKEN_SYMBOL" ]]; do
        sleep 2
        ISSUED_LOG=$(tbnbcli token issue --symbol DEV --total-supply 10000000000000000 --token-name "DEV Token" | jq .Response.log)
        TOKEN_SYMBOL=${ISSUED_LOG:(-8):7}
    done

    echo "Issued $TOKEN_SYMBOL"

    sed -i 's/FOREIGN_ASSET=.*$/FOREIGN_ASSET='"$TOKEN_SYMBOL"'/' ../src/test-services/binanceBalance/.env.development
    sed -i 's/FOREIGN_ASSET=.*$/FOREIGN_ASSET='"$TOKEN_SYMBOL"'/' ../src/test-services/binanceSend/.env.development
    sed -i 's/FOREIGN_ASSET=.*$/FOREIGN_ASSET='"$TOKEN_SYMBOL"'/' ../tests/.env
    for file in ./validator*/.env.development; do
        sed -i 's/FOREIGN_ASSET=.*$/FOREIGN_ASSET='"$TOKEN_SYMBOL"'/' "$file"
    done

    sleep 2

    echo "Sending tokens to controlled address"
    tbnbcli token multi-send  \
    --transfers '[{"to":"tbnb1z7u9f8mcuwxanns9xa6qgjtlka0d392epc0m9x","amount":"10000000000000000:BNB,10000000000000000:'"$TOKEN_SYMBOL"'"}]' &>/dev/null

    sleep 2
else
    echo "Tokens are already issued, run clean.sh first if you want to redeploy everything"
fi
