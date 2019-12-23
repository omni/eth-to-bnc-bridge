#!/bin/bash

trap cleanup EXIT

cleanup() {
  # Kill the ganache instance that we started (if we started one and if it's still running).
  if [ -n "$ganache_pid" ] && ps -p $ganache_pid > /dev/null; then
    kill -9 $ganache_pid
  fi
}

ganache-cli --gasLimit 0xfffffffffff -m "shrug dwarf easily blade trigger lucky reopen cage lake scatter desk boat" -i 55 > /dev/null &
ganache_pid=$!

truffle test --network test
