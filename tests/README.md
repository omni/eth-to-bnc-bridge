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
./tests/init.sh
```
This will create a clean development environment, using `./demo/start-environment.sh`.
Then, this command will start 3 validators in daemon mode (using `./demo/validator-demo.sh`), 
and wait until they are ready.

Next, you can run the tests:
```bash
./tests/run.sh
```

After tests are done, all active docker containers should be killed automatically. 
Or you can do it manually:
```bash
docker kill $(docker ps | grep validator[1-3]_ | awk '{print $1}')
docker kill $(docker ps | grep ethereum-testnet_ | awk '{print $1}')
docker kill $(docker ps | grep binance-testnet_ | awk '{print $1}')
``` 
