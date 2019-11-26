#!/bin/bash

set -e

cd $(dirname "$0")
cd ..

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}
BLOCK_TIME=${BLOCK_TIME:=3}

DEPLOY_DIR="`pwd`/src/deploy"
TEST_SERVICES_DIR="`pwd`/src/test-services"
DEMO_DIR="`pwd`/demo"

HOME_NETWORK="ethereum_home_rpc_net"
SIDE_NETWORK="ethereum_side_rpc_net"

deploy_token() {
  echo "Compiling and deploying erc20"

  echo "Building deploy docker image"
  docker build -t deploy_test "$DEPLOY_DIR/deploy-test" > /dev/null 2>&1

  echo "Deploying"
  if [[ "$TARGET_NETWORK" == "development" ]]; then
    TOKEN_ADDRESS=$(docker run --network "$HOME_NETWORK" --rm -v "$DEPLOY_DIR/deploy-test/build:/build/build" --env-file "$DEPLOY_DIR/deploy-test/.env.development" \
    deploy_test \
    --network home 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  else
    TOKEN_ADDRESS=$(docker run --rm -v "$DEPLOY_DIR/deploy-test/build:/build/build" --env-file "$DEPLOY_DIR/deploy-test/.env.staging" --env-file "$DEPLOY_DIR/.keys.staging" \
    deploy_test \
    --network home 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  fi
}

deploy_bridge() {
  echo "Compiling and deploying home part"

  echo "Building deploy docker image"
  docker build -t deploy_home "$DEPLOY_DIR/deploy-home" > /dev/null 2>&1

  echo "Deploying"
  if [[ "$TARGET_NETWORK" == "development" ]]; then
    BRIDGE_ADDRESS=$(docker run --network "$HOME_NETWORK" --rm -v "$DEPLOY_DIR/deploy-home/build:/build/build" --env-file "$DEPLOY_DIR/deploy-home/.env.development" \
    deploy_home \
    --network home 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  else
    BRIDGE_ADDRESS=$(docker run --rm -v "$DEPLOY_DIR/deploy-home/build:/build/build" --env-file "$DEPLOY_DIR/deploy-home/.env.staging" --env-file "$DEPLOY_DIR/.keys.staging" \
    deploy_home \
    --network home 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  fi
}

deploy_db() {
  echo "Compiling and deploying side part"

  echo "Building deploy docker image"
  docker build -t deploy_side "$DEPLOY_DIR/deploy-side" > /dev/null 2>&1

  echo "Deploying"
  if [[ "$TARGET_NETWORK" == "development" ]]; then
    SHARED_DB_ADDRESS=$(docker run --network "$SIDE_NETWORK" --rm -v "$DEPLOY_DIR/deploy-side/build:/build/build" --env-file "$DEPLOY_DIR/deploy-side/.env.development" \
    deploy_side \
    --network side 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  else
    SHARED_DB_ADDRESS=$(docker run --rm -v "$DEPLOY_DIR/deploy-side/build:/build/build" --env-file "$DEPLOY_DIR/deploy-side/.env.staging" --env-file "$DEPLOY_DIR/.keys.staging" \
    deploy_side \
    --network side 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
  fi
}

deploy_all() {
  TOKEN_ADDRESS=$(source "$DEPLOY_DIR/deploy-home/.env.$TARGET_NETWORK"; echo "$HOME_TOKEN_ADDRESS")

  if [[ "$TARGET_NETWORK" == "development" ]] || [[ "$TOKEN_ADDRESS" == "0x" ]]; then
    deploy_token
    sed -i 's/TOKEN_ADDRESS=0x$/TOKEN_ADDRESS='"$TOKEN_ADDRESS"'/' "$DEPLOY_DIR/deploy-home/.env.$TARGET_NETWORK"
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
}

if [[ "$TARGET_NETWORK" == "development" ]]; then

  if [[ "$(docker volume ls | grep ganache_side_data)" ]] || [[ "$(docker volume ls | grep ganache_home_data)" ]]; then
    echo "Restarting ethereum test network"
  else
    echo "Creating new ethereum test network"

    echo "Removing old environment"
    docker kill $(docker ps -a | grep ethereum-testnet_ | awk '{print $1}') > /dev/null 2>&1 || true
    docker rm $(docker ps -a | grep ethereum-testnet_ | awk '{print $1}') > /dev/null 2>&1 || true
    docker volume rm ganache_side_data > /dev/null 2>&1 || true
    docker volume rm ganache_home_data > /dev/null 2>&1 || true

    docker network create ethereum_side_rpc_net > /dev/null 2>&1 || true
    docker network create ethereum_home_rpc_net > /dev/null 2>&1 || true
    docker volume create ganache_side_data > /dev/null 2>&1 || true
    docker volume create ganache_home_data > /dev/null 2>&1 || true

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
