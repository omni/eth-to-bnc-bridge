#!/bin/bash

set -e

cd $(dirname "$0")

for (( I = 1; I < 4; ++I )); do
    DIRNAME="validator$I"
    rm -r "$DIRNAME/db"
    rm -r "$DIRNAME/queue"
    rm -r "$DIRNAME/keys"
    mkdir "$DIRNAME/db"
    mkdir "$DIRNAME/queue"
    mkdir "$DIRNAME/keys"
done
