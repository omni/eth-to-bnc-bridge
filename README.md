### Ethereum to Binance Chain bridge demo

https://forum.poa.network/t/ethereum-to-binance-chain-bridge/2696

#### Demo info
This demo, at the beginning, consists of three validator parties, while only 
two are enough to sign any transaction in the Binance Chain, 
confirm token transfer on the Ethereum Side, or vote for state changes.

ERC20 Token is used on the Ethereum side of the bridge.

BNB Token is used on the Binance Chain side.

#### Running demo:
1) Build tss from local source.  
```docker build -t tss -f ./src/tss/Dockerfile-local ./src/tss```
2) Run test environment (home and side blockchains, contracts deployment)
```./demo/start-environment.sh```
3) Run three validators in separate terminal sessions   
```N=1 ./demo/validator-demo.sh```  
```N=2 ./demo/validator-demo.sh```  
```N=3 ./demo/validator-demo.sh```


#### Interacting with validators, sending votes, retrieving bridge information
* For each validator, a specific port is mapped outside of the docker 
container for listening GET requests
    - 5001 - first validator
    - 5002 - second validator
    - 5003 - third validator
* Retrieving bridge state
    - http://localhost:5000/info
* Voting for bridge state changes
    - http://localhost:5000/vote/startEpoch/NEW_EPOCH
        - ```NEW_EPOCH``` should be equal nextEpoch + 1
        - After enough votes are collected, keygen process starts, and 
        ends with transfer of all remained funds in the Binance Chain 
        to the new generated account
    - http://localhost:5000/vote/addValidator/ADDRESS
        - ```ADDRESS``` is the Ethereum address of a validator
        - After enough votes are collected, validator is added into 
        the pending validators list for the next epoch
    - http://localhost:5000/vote/addValidator/ADDRESS
        - ```ADDRESS``` is the Ethereum address of a validator
        - After enough votes are collected, validator is removed from
        the pending validators list for the next epoch
        
#### Tools for sending transactions on both sides of the bridge

Run this scripts from ```src/oracle``` dir

* ```node testBinanceSend.js PRIVATE_KEY TO VALUE [MEMO]```
    - ```PRIVATE_KEY``` - private key of sender in the Binance Chain
    - ```TO``` - receiver address, current bridge address in the Binance Chain
    - ```VALUE``` - amount of BNB to send
    - ```MEMO``` - transaction memo, receiver on the Ethereum side, leave blank for just pre-funding
* ```node testApprove.js TO VALUE```
    - Approves specified amount of tokens to the bridge account and calls
    needed method for starting exchange process
    - ```TO``` - receiver address in the Binance Chain
    - ```VALUE``` - amount of tokens to transfer and exchange 
