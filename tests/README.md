# Ethereum to Binance Chain / E2E tests

## Prerequisites

To run the tests you need to have
[Docker](https://www.docker.com/community-edition) and
[Docker Compose](https://docs.docker.com/compose/install/) installed.

## Correlation with CircleCI tests

CircleCI uses this tests for testing the code base.

## Running

To run the bridge tests, you first need to clean old test environment, and then initialize a new one:
```bash
./demo/clean.sh
./tests/init.sh
```
This will create a clean development environment, using `./demo/start-environment.sh`.
This will also prefund user accounts from `./tests/config.json` for both networks. 
Prefunding process uses `./src/test-services` scripts. 
Finally, this command will start 3 validators in  daemon mode (using `./demo/validator-demo.sh`), 
and wait until they are ready.

Next, you can run the tests:
```bash
FOREIGN_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000000 ./tests/run.sh
```
`FOREIGN_PRIVATE_KEY` is the key, that will be used for initial prefunding first 
generated binance side of the bridge. 

After tests are done, all active docker containers can be killed.
```bash
docker kill $(docker ps | grep validator[1-3]_ | awk '{print $1}')
docker kill ganache_side ganache_home
``` 