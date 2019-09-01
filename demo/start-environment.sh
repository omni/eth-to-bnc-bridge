#!/bin/bash

set -e

cd $(dirname "$0")
cd ..

# either development or staging
TARGET_NETWORK=${TARGET_NETWORK:=development}

DEPLOY_DIR="`pwd`/src/deploy"
DEMO_DIR="`pwd`/demo"

SIDE_GANACHE_DB="$DEMO_DIR/ganache_side_db"
HOME_GANACHE_DB="$DEMO_DIR/ganache_home_db"

start_dev_blockchain_networks() {
  echo "Starting side test blockchain"

  docker kill ganache_side > /dev/null 2>&1 || true
  docker network create blockchain_side > /dev/null 2>&1 || true
  docker run -d --network blockchain_side --rm --name ganache_side -v "$SIDE_GANACHE_DB:/app/db" \
      trufflesuite/ganache-cli:latest \
      -m "shrug dwarf easily blade trigger lucky reopen cage lake scatter desk boat" -i 33 -q --db /app/db

  echo "Starting home test blockchain"

  docker kill ganache_home > /dev/null 2>&1 || true
  docker network create blockchain_home > /dev/null 2>&1 || true
  docker run -d --network blockchain_home --rm --name ganache_home -v "$HOME_GANACHE_DB:/app/db" \
      trufflesuite/ganache-cli:latest \
      -m "shrug dwarf easily blade trigger lucky reopen cage lake scatter desk boat" -i 44 -q --db /app/db

  sleep 4
}

deploy_token() {
  echo "Compiling and deploying erc20"

  echo "Building deploy docker image"
  docker build -t deploy_test "$DEPLOY_DIR/deploy-test" > /dev/null 2>&1

  echo "Deploying"
  TOKEN_ADDRESS=$(docker run --network blockchain_home --rm --env-file "$DEPLOY_DIR/deploy-test/.env" -e "PRIVATE_KEY=$PRIVATE_KEY_KOVAN" \
    deploy_test \
    --network "$TARGET_NETWORK" 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
}

deploy_bridge() {
  echo "Compiling and deploying home part"

  echo "Building deploy docker image"
  docker build -t deploy_home "$DEPLOY_DIR/deploy-home" > /dev/null 2>&1

  echo "Deploying"
  BRIDGE_ADDRESS=$(docker run --network blockchain_home --rm --env-file "$DEPLOY_DIR/deploy-home/.env" -e "PRIVATE_KEY=$PRIVATE_KEY_KOVAN" \
    deploy_home \
    --network "$TARGET_NETWORK" 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
}

deploy_db() {
  echo "Compiling and deploying side part"

  echo "Building deploy docker image"
  docker build -t deploy_side "$DEPLOY_DIR/deploy-side" > /dev/null 2>&1

  echo "Deploying"
  SHARED_DB_ADDRESS=$(docker run --network blockchain_side --rm --env-file "$DEPLOY_DIR/deploy-side/.env" -e "PRIVATE_KEY=$PRIVATE_KEY_SOKOL" \
    deploy_side \
    --network "$TARGET_NETWORK" 2>&1 \
    | grep "contract address" \
    | awk '{print $4}')
}

deploy_all() {
  cd "$DEPLOY_DIR"

  source "$DEPLOY_DIR/.keys"

  TOKEN_ADDRESS=$(source "$DEPLOY_DIR/deploy-home/.env"; echo "$TOKEN_ADDRESS")

  if [[ "$TARGET_NETWORK" == "development" ]] || [[ "$TOKEN_ADDRESS" == "0x" ]]; then
    deploy_token
    sed -i 's/TOKEN_ADDRESS=0x$/TOKEN_ADDRESS='"$TOKEN_ADDRESS"'/' "$DEPLOY_DIR/deploy-home/.env"
  fi

  deploy_bridge
  deploy_db

  echo "Token contract address in $TARGET_NETWORK network is $TOKEN_ADDRESS"
  echo "Bridge contract address in $TARGET_NETWORK network is $BRIDGE_ADDRESS"
  echo "Database contract address in $TARGET_NETWORK side network is $SHARED_DB_ADDRESS"

  echo "Updating deployed contract addresses in demo validators .env.$TARGET_NETWORK configs"
  for file in "$DEMO_DIR"/validator*/.env."$TARGET_NETWORK"; do
    sed -i 's/TOKEN_ADDRESS=.*$/TOKEN_ADDRESS='"$TOKEN_ADDRESS"'/' "$file"
    sed -i 's/BRIDGE_ADDRESS=.*$/BRIDGE_ADDRESS='"$BRIDGE_ADDRESS"'/' "$file"
    sed -i 's/SHARED_DB_ADDRESS=.*$/SHARED_DB_ADDRESS='"$SHARED_DB_ADDRESS"'/' "$file"
  done
}




if [[ "$TARGET_NETWORK" == "development" ]]; then
  if [[ ! -d "$SIDE_GANACHE_DB" ]]; then
    mkdir "$SIDE_GANACHE_DB"
  fi

  if [[ ! -d "$HOME_GANACHE_DB" ]]; then
    mkdir "$HOME_GANACHE_DB"
  fi


  if [[ -z "$(ls -A "$SIDE_GANACHE_DB")" ]] || [[ -z "$(ls -A "$HOME_GANACHE_DB")" ]]; then
    echo "Starting dev blockchain networks and deploying contracts"
    need_to_deploy=true
  else
    echo "Restarting dev blockchain networks"
  fi

  start_dev_blockchain_networks

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
