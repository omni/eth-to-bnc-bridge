#!/bin/bash

set -e

TOTAL=100

for (( i = 0; i <= $TOTAL; i++ )); do

    echo ================================================
    echo Starting attempt "$i"

    echo Killing all containers
    docker kill $(docker ps | awk 'NR>1 {print $1}') > /dev/null 2>&1 || true

    echo Starting ssm
    ./src/ssm/start.sh > /dev/null

    echo Start sign client 1
    KEY_FILE=keys.store ./src/oracle/tss-client/sign.sh some_random_message > client1.log 2>&1 &
    PROC_1=$!

    sleep 2

    echo Start sign client 2
    KEY_FILE=keys1.store ./src/oracle/tss-client/sign.sh some_random_message > client2.log 2>&1 &
    PROC_2=$!

    wait "$PROC_1"
    echo First client finished with $?
    wait "$PROC_2"
    echo Second client finished with $?

done
