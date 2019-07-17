### Ethereum to Binance Chain bridge demo

https://forum.poa.network/t/ethereum-to-binance-chain-bridge/2696

#### Demo info
This demo, at the beginning, consists of three validator parties, while only 
two are enough to sign any transaction in the Binance Chain, 
confirm token transfer on the Ethereum Side, or vote for state changes.

ERC20 Token is used on the Ethereum side of the bridge.
All ERC20 tokens are initially located on the address associated 
with ```DEPLOY_PRIVATE_KEY```.

BEP2 Token is used on the Binance Chain side.

All parts of this demo are docker containers.

#### Running demo:
1) Build tss from local source. (TSS cryptographic executables are taken from this image) \
```docker build -t tss -f ./src/tss/Dockerfile-local ./src/tss```
2) Run test environment. (home and side ganache-cli blockchains, contracts deployment)
```./demo/start-environment.sh```
3) Run three validators in separate terminal sessions.\
```N=1 ./demo/validator-demo.sh```\
```N=2 ./demo/validator-demo.sh```\
```N=3 ./demo/validator-demo.sh```

#### Interacting with validators, sending votes, retrieving bridge information
* For each validator, a specific port is mapped outside of the docker 
container for listening GET requests
    - 5001 - first validator
    - 5002 - second validator
    - 5003 - third validator
* Retrieving bridge state
    - http://localhost:5001/info
* Voting for bridge state changes
    - http://localhost:5001/vote/startKeygen
        - After enough votes are collected, keygen process starts, and 
        ends with the transfer of all remained funds in the Binance Chain 
        to the new generated bridge account.
    - http://localhost:5001/vote/addValidator/ADDRESS
        - ```ADDRESS``` - Ethereum address of a validator.
        - After enough votes are collected, validator is added into 
        the next validators list for the next epoch.
    - http://localhost:5001/vote/addValidator/ADDRESS
        - ```ADDRESS``` - Ethereum address of a validator.
        - After enough votes are collected, validator is removed from
        the next validators list for the next epoch.
        
#### Testing tools for both sides of the bridge

In this tools, ```run.sh``` file simply builds and runs a docker container
for interacting with test blockchains. 

* ```./src/test-services/binanceSend/run.sh TO TOKENS NATIVE```
    - Sends specified amount of tokens and BNBs to the bridge account.
    - ```TO``` - receiver address in the Binance Chain.
    - ```TOKENS``` - amount of tokens to send.
    - ```NATIVE``` - amount of BNB tokens to send, if present, the 
    transaction is considered as a funding one.
* ```./src/test-services/ethereumSend/run.sh TOKENS```
    - Transfers specified amount of tokens to the bridge account.
    - ```VALUE``` - amount of tokens to transfer and exchange.
* ```./src/test-services/binanceBalance/run.sh ADDRESS```
    - Gets current BEP2 token and BNB balances of the specified account.
    - ```ADDRESS``` - account address in the Binance Chain.
* ```./src/test-services/ethereumBalance/run.sh ADDRESS```
    - Gets current ERC20 token balance of the specified account.
    - ```ADDRESS``` - Ethereum address of the account.
