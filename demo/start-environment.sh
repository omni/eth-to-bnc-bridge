#!/bin/bash

set -e

cd $(dirname "$0")

TARGET_NETWORK=${TARGET_NETWORK:=development}

start_blockchains() {
  echo "Starting side test blockchain"

  docker kill ganache_side > /dev/null 2>&1 || true
  docker network create blockchain_side > /dev/null 2>&1 || true
  docker run -d --network blockchain_side --rm --name ganache_side -v "$side_db_mount_point:/app/db" \
      trufflesuite/ganache-cli:latest \
      -m "shrug dwarf easily blade trigger lucky reopen cage lake scatter desk boat" -i 33 -q --db /app/db

  echo "Starting home test blockchain"

  docker kill ganache_home > /dev/null 2>&1 || true
  docker network create blockchain_home > /dev/null 2>&1 || true
  docker run -d --network blockchain_home --rm --name ganache_home -v "$home_db_mount_point:/app/db" \
      trufflesuite/ganache-cli:latest \
      -m "shrug dwarf easily blade trigger lucky reopen cage lake scatter desk boat" -i 44 -q --db /app/db

  sleep 4
}

deploy_all() {
  cd ../src/deploy

  source .keys

  TOKEN_ADDRESS=$(source ./deploy-home/.env; echo "$TOKEN_ADDRESS")

  if [[ "$TARGET_NETWORK" == "development" ]] || [[ "$TOKEN_ADDRESS" == "0x" ]]; then
    echo "Compiling and deploying erc20"

    cd ./deploy-test

    echo "Building deploy docker image"
    docker build -t deploy_test . > /dev/null 2>&1
    echo "Deploying"
    TOKEN_ADDRESS=$(docker run --network blockchain_home --rm --env-file .env -e "PRIVATE_KEY=$PRIVATE_KEY_KOVAN" deploy_test --network "$TARGET_NETWORK" 2>&1 \
      | grep "contract address" \
      | awk '{print $4}')
    sed -i 's/TOKEN_ADDRESS=0x$/TOKEN_ADDRESS='"$TOKEN_ADDRESS"'/' ../deploy-home/.env
    cd ..
  fi

  echo "Compiling and deploying home part"

  cd ./deploy-home

  echo "Building deploy docker image"
  docker build -t deploy_home . > /dev/null 2>&1
  echo "Deploying"
  BRIDGE_ADDRESS=$(docker run --network blockchain_home --rm --env-file .env -e "PRIVATE_KEY=$PRIVATE_KEY_KOVAN" deploy_home --network "$TARGET_NETWORK" 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')



  echo "Compiling and deploying side part"

  cd ../deploy-side

  echo "Building deploy docker image"
  docker build -t deploy_side . > /dev/null 2>&1
  echo "Deploying"
  SHARED_DB_ADDRESS=$(docker run --network blockchain_side --rm --env-file .env -e "PRIVATE_KEY=$PRIVATE_KEY_SOKOL" deploy_side --network "$TARGET_NETWORK" 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')

  echo "Token contract address in $TARGET_NETWORK network is $TOKEN_ADDRESS"
  echo "Bridge contract address in $TARGET_NETWORK network is $BRIDGE_ADDRESS"
  echo "Database contract address in $TARGET_NETWORK side network is $SHARED_DB_ADDRESS"
}

if [[ "$TARGET_NETWORK" == "development" ]]; then
  if [[ -z "$(ls -A ganache_side_db)" ]] || [[ -z "$(ls -A ganache_home_db)" ]]; then
    echo "Starting dev blockchain networks and deploying contracts"
    need_to_deploy=true
  else
    echo "Restarting dev blockchain networks"
  fi

  side_db_mount_point="$(pwd)/ganache_side_db"
  if [[ ! -d "$side_db_mount_point" ]]; then
    mkdir "$side_db_mount_point"
  fi

  home_db_mount_point="$(pwd)/ganache_home_db"
  if [[ ! -d "$home_db_mount_point" ]]; then
    mkdir "$home_db_mount_point"
  fi

  start_blockchains

  if [[ -n "$need_to_deploy" ]]; then
    deploy_all
  fi
else
  echo "Deploying to staging blockchain environment"

  source ../src/deploy/.keys

  deploy_all
fi

echo "Done"
