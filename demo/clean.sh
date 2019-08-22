#!/bin/bash

set -e

cd $(dirname "$0")

rm -rf ganache_side_db
rm -rf ganache_home_db

for (( I = 1; I < 4; ++I )); do
    DIRNAME="validator$I"
    rm -rf "$DIRNAME/db"
    rm -rf "$DIRNAME/queue"
    rm -rf "$DIRNAME/keys"
    mkdir "$DIRNAME/db"
    mkdir "$DIRNAME/queue"
    mkdir "$DIRNAME/keys"
done
