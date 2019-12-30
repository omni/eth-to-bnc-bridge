#!/bin/bash

set -e

cd $(dirname "$0")
cd ..

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}
BLOCK_TIME=${BLOCK_TIME:=3}

CONTRACTS_DIR="`pwd`/src/contracts"
HOME_CONTRACTS_DIR="$CONTRACTS_DIR/home"
SIDE_CONTRACTS_DIR="$CONTRACTS_DIR/side"
TEST_SERVICES_DIR="`pwd`/src/test-services"
DEMO_DIR="`pwd`/demo"

HOME_NETWORK="ethereum_home_rpc_net"
SIDE_NETWORK="ethereum_side_rpc_net"

deploy_token() {
  echo "Compiling and deploying erc20"

  echo "Building deploy docker image"
  docker build -t deploy_home -f "$HOME_CONTRACTS_DIR/deploy/Dockerfile" "$HOME_CONTRACTS_DIR" &>/dev/null

  echo "Deploying"
  if [[ "$TARGET_NETWORK" == "development" ]]; then
    TOKEN_ADDRESS=$(docker run --network "$HOME_NETWORK" -v "$HOME_CONTRACTS_DIR/build:/build/build" \
    --env-file "$HOME_CONTRACTS_DIR/deploy/.env.development" \
    -e "DEPLOY_TOKEN=true" \
    --name deploy_token \
    deploy_home \
    --network home 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  else
    TOKEN_ADDRESS=$(docker run -v "$HOME_CONTRACTS_DIR/deploy/build:/build/build" \
    --env-file "$HOME_CONTRACTS_DIR/deploy/.env.staging" \
    --env-file "$CONTRACTS_DIR/.keys.staging" \
    -e "DEPLOY_TOKEN=true" \
    --name deploy_token \
    deploy_home \
    --network home 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  fi
}

deploy_bridge() {
  echo "Compiling and deploying home part"

  echo "Building deploy docker image"
  docker build -t deploy_home -f "$HOME_CONTRACTS_DIR/deploy/Dockerfile" "$HOME_CONTRACTS_DIR" &>/dev/null

  echo "Deploying"
  if [[ "$TARGET_NETWORK" == "development" ]]; then
    BRIDGE_ADDRESS=$(docker run --network "$HOME_NETWORK" -v "$HOME_CONTRACTS_DIR/build:/build/build" \
    --env-file "$HOME_CONTRACTS_DIR/deploy/.env.development" \
    --name deploy_bridge \
    deploy_home \
    --network home 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  else
    BRIDGE_ADDRESS=$(docker run -v "$HOME_CONTRACTS_DIR/build:/build/build" \
    --env-file "$HOME_CONTRACTS_DIR/deploy/.env.staging" \
    --env-file "$CONTRACTS_DIR/.keys.staging" \
    --name deploy_bridge \
    deploy_home \
    --network home 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  fi
}

deploy_db() {
  echo "Compiling and deploying side part"

  echo "Building deploy docker image"
  docker build -t deploy_side -f "$SIDE_CONTRACTS_DIR/deploy/Dockerfile" "$SIDE_CONTRACTS_DIR" &>/dev/null

  echo "Deploying"
  if [[ "$TARGET_NETWORK" == "development" ]]; then
    SHARED_DB_ADDRESS=$(docker run --network "$SIDE_NETWORK" -v "$SIDE_CONTRACTS_DIR/build:/build/build" \
    --env-file "$SIDE_CONTRACTS_DIR/deploy/.env.development" \
    --name deploy_db \
    deploy_side \
    --network side 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  else
    SHARED_DB_ADDRESS=$(docker run -v "$SIDE_CONTRACTS_DIR/build:/build/build" \
    --env-file "$SIDE_CONTRACTS_DIR/deploy/.env.staging" \
    --env-file "$CONTRACTS_DIR/.keys.staging" \
    --name deploy_db \
    deploy_side \
    --network side 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  fi
}

deploy_all() {
  TOKEN_ADDRESS=$(source "$HOME_CONTRACTS_DIR/deploy/.env.$TARGET_NETWORK"; echo "$HOME_TOKEN_ADDRESS")

  if [[ "$TARGET_NETWORK" == "development" ]] || [[ "$TOKEN_ADDRESS" == "0x" ]]; then
    deploy_token
    sed -i 's/TOKEN_ADDRESS=0x$/TOKEN_ADDRESS='"$TOKEN_ADDRESS"'/' "$HOME_CONTRACTS_DIR/deploy/.env.$TARGET_NETWORK"
  fi

  deploy_bridge
  deploy_db

  echo "Token contract address in $TARGET_NETWORK network is $TOKEN_ADDRESS"
  echo "Bridge contract address in $TARGET_NETWORK network is $BRIDGE_ADDRESS"
  echo "Database contract address in $TARGET_NETWORK side network is $SHARED_DB_ADDRESS"

  echo "Updating deployed contract addresses in demo validators .env.$TARGET_NETWORK configs"
  for file in "$DEMO_DIR"/validator*/.env."$TARGET_NETWORK"; do
    sed -i 's/HOME_TOKEN_ADDRESS=.*$/HOME_TOKEN_ADDRESS='"$TOKEN_ADDRESS"'/' "$file"
    sed -i 's/HOME_BRIDGE_ADDRESS=.*$/HOME_BRIDGE_ADDRESS='"$BRIDGE_ADDRESS"'/' "$file"
    sed -i 's/SIDE_SHARED_DB_ADDRESS=.*$/SIDE_SHARED_DB_ADDRESS='"$SHARED_DB_ADDRESS"'/' "$file"
  done

  echo "Updating deployed contract addresses in test-services .env.$TARGET_NETWORK configs"
  sed -i 's/HOME_TOKEN_ADDRESS=.*$/HOME_TOKEN_ADDRESS='"$TOKEN_ADDRESS"'/' "$TEST_SERVICES_DIR/ethereumBalance/.env.$TARGET_NETWORK"
  sed -i 's/HOME_BRIDGE_ADDRESS=.*$/HOME_BRIDGE_ADDRESS='"$BRIDGE_ADDRESS"'/' "$TEST_SERVICES_DIR/ethereumSend/.env.$TARGET_NETWORK"
  sed -i 's/HOME_TOKEN_ADDRESS=.*$/HOME_TOKEN_ADDRESS='"$TOKEN_ADDRESS"'/' "$TEST_SERVICES_DIR/ethereumSend/.env.$TARGET_NETWORK"
  sed -i 's/HOME_BRIDGE_ADDRESS=.*$/HOME_BRIDGE_ADDRESS='"$BRIDGE_ADDRESS"'/' "$TEST_SERVICES_DIR/getBridgeHistory/.env.$TARGET_NETWORK"
  sed -i 's/SIDE_SHARED_DB_ADDRESS=.*$/SIDE_SHARED_DB_ADDRESS='"$SHARED_DB_ADDRESS"'/' "$TEST_SERVICES_DIR/getBridgeHistory/.env.$TARGET_NETWORK"
}

if [[ "$TARGET_NETWORK" == "development" ]]; then

  if [[ "$(docker volume ls | grep ganache_side_data)" ]] || [[ "$(docker volume ls | grep ganache_home_data)" ]]; then
    echo "Restarting ethereum test network"
  else
    echo "Creating new ethereum test network"

    echo "Removing old environment"
    docker kill $(docker ps -a | grep ethereum-testnet_ | awk '{print $1}') &>/dev/null || true
    docker rm $(docker ps -a | grep ethereum-testnet_ | awk '{print $1}') &>/dev/null || true
    docker volume rm ganache_side_data &>/dev/null || true
    docker volume rm ganache_home_data &>/dev/null || true

    docker network create ethereum_side_rpc_net &>/dev/null || true
    docker network create ethereum_home_rpc_net &>/dev/null || true
    docker volume create ganache_side_data &>/dev/null || true
    docker volume create ganache_home_data &>/dev/null || true

    need_to_deploy=true
  fi

  echo "Starting ethereum test environment"

  BLOCK_TIME="$BLOCK_TIME" docker-compose -f ./src/ethereum-testnet/docker-compose.yml up --build -d

  sleep 4

  if [[ -n "$need_to_deploy" ]]; then
    deploy_all
  else
    echo "Contracts are already deployed, run clean.sh first if you want to redeploy everything"
  fi

else
  echo "Deploying to the staging blockchain environment"

  deploy_all
fi

echo "Done"
