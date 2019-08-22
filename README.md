## Ethereum to Binance Chain bridge

https://forum.poa.network/t/ethereum-to-binance-chain-bridge/2696

The bridge is able to transfer an ERC20 tokens on an EVM based chain to BEP2 to the Binance Chain.

It includes the following components:
1. The bridge contract on an EVM-based chain that is responsible to receive and release ERC20 tokens 
2. The orchestration contract on an EVM-based chain that participate in MPC (multy-party computations) to generate a threshold signature.
3. The oracle that monitors the chains and the send transactions. One oracle represents one bridge validator (one private key).

The idea of the bridge is similar to [the token bridge](https://github.com/poanetwork/tokenbridge) produced by [POA.Network](https://poa.network/):
- every oracle sends its confirmation as soon as a user sends the token relay request in one chain.
- when enough confirmations collected the requested amount of tokens is unlocked in another chain.

Collecting confirmations for the Binance Chain is made in form of mutlisig wallet - the validator's confirmation is participation in the transaction signature gneration with usage of Threshold Signature Scheme implemented for ECDSA by [KZen Research team](https://github.com/KZen-networks/multi-party-ecdsa).

#### Demo

This demo, at the beginning, consists of three validator parties, while only two are enough to sign any transaction in the Binance Chain, confirm token transfer on the Ethereum Side, or vote for state changes.

BEP2 Token is used on the Binance Chain side.

All parts of this demo are docker containers.

#### Running demo:

1. Preparation
    * (1.1) Download `tbnbcli` from https://github.com/binance-chain/node-binary/tree/master/cli.
    * (1.2) Create a new account through the [web-interface](https://testnet.binance.org/en/create). Copy the private key and mnemonic phrase. The private key will be used to import it in an Ethereum Wallet. The mnemonic phrase is to recover the BNB with `tbnbcli`.
    * (1.3) Recover the account in the console with the mnemonic.
      ```
      ./tbnbcli keys add test_account1 --recover
      ```
    * (1.4) Create few BNB accounts from the console. They will be donors to provide enough funds to issue a BEP2 tokens (500 BNB required).
      ```
      ./tbnbcli keys add test_account2
      ./tbnbcli keys add test_account3
      ```
    * (1.5) Register on the Binance site and fund the accounts from the [testnet faucet](https://www.binance.com/en/dex/testnet/address).
    * (1.6) Re-arrange funds on the accounts as so the first account will have 550 BNB and others 10-20 BNBs to make transactions.
      ```
      ./tbnbcli send --from test_account2 --to <address of the first account> \ 
        --amount 18500000000:BNB --chain-id=Binance-Chain-Nile \
        --node=data-seed-pre-2-s1.binance.org:80 --memo "donate"
      ./tbnbcli send --from test_account3 --to <address of the first account> \
        --amount 18500000000:BNB --chain-id=Binance-Chain-Nile 
        --node=data-seed-pre-2-s1.binance.org:80 --memo "donate"
      ```
    * (1.7) Issue the BEP2 token from the first account. `3141500000000000` corresponds to `31415000.0` tokens.
      ```
      ./tbnbcli token issue --token-name "ERC20toBEP2Bridge" --total-supply 3141500000000000 \
        --symbol ETB0819 --mintable --from test_account1 --chain-id=Binance-Chain-Nile \
        --node=data-seed-pre-2-s1.binance.org:80 --trust-node
      ```
      In the real deployment most probably the token must not be mintable.
    * (1.8) Get the BEP2 token ID in `denom` field (in this example it is `ETB0819-863`).
      ```
      ./tbnbcli account <address of the first account> \
        --chain-id=Binance-Chain-Nile --node=data-seed-pre-2-s1.binance.org:80 --trust-node
      ```
    * (1.9) Clone the repo and initialize git submodules:
      ```
      git clone --recurse-submodules https://github.com/k1rill-fedoseev/eth-to-bnc-bridge.git
      ```
    * (1.10) Build TSS to be used in the bridge oracles:
      ```
      docker build -t tss -f ./src/tss/Dockerfile-local ./src/tss
      ```
2. Run test environment
    * (2.1) Modify `src/deploy/deploy-test/.env` and specify the amount of tokens to mint in the parameter `TOKEN_INITIAL_MINT`.
    * (2.2) Run testnets and deploy contracts
      ```
      ./demo/start-environment.sh
      ```
      This command will also mint tokens, the owner of tokens is the address that corresponds to the private key specified in `PRIVATE_KEY_DEV` of `src/deploy/deploy-test/.env`.
    * (2.3) Get the Ethereum account address for the first test account from its private key (step 1.2). NiftyWallet could be used for this.
    * (2.4) Modify the parameter `RECEIVER_ADDRESS` in `src/test-services/ethereumSend/.env` as so it contains the Ethereum address of the first account.
    * (2.5) Send few tokens from the current token owner to the first account:
      ```
      ./src/test-services/ethereumSend/run.sh 5000000000000000000
      ```
    * (2.6) Check that the tokens were transferred properly:
      ```
      ./src/test-services/ethereumBalance/run.sh <first account Ethereum address>
      ``` 
3. Run validators nodes:
    * (3.1) Modify the parameter `FOREIGN_ASSET` in `demo/validator1/.env`, `demo/validator2/.env` and `demo/validator3/.env` to specify the identificator of the token (step 1.8) that the oracle will watch.
    * (3.2) Run three validators in separate terminal sessions.
      ```
      N=1 ./demo/validator-demo.sh
      N=2 ./demo/validator-demo.sh
      N=3 ./demo/validator-demo.sh
      ```
      Wait for when the line like the following appears:
      ```
      keygen_1 | Generated multisig account in binance chain: tbnb1mutgnx9n9devmrjh3d0wz332fl8ymgel6tydx6
      ```
      The line contains the address of the bridge address in the Bincance Chain.
4. Initialize the state of the bridge account in the Binance Chain
    * (4.1) Fill the balance Fund with BNB coins as so the account will be able to make transactions:
      ```
      ./tbnbcli send --from test_account1 --to <address of the bridge account> \ 
        --amount 1000000000:BNB --chain-id=Binance-Chain-Nile \
        --node=data-seed-pre-2-s1.binance.org:80 --memo "initialization"
      ```    
    * (4.2) Fund the account with bridgeable tokens. **This transaction should have 'funding' in the memo**:
      ```
      ./tbnbcli send --from test_account1 --to <address of the bridge account> \ 
        --amount 3141500000000000:ETB0819-863 --chain-id=Binance-Chain-Nile \
        --node=data-seed-pre-2-s1.binance.org:80 --memo "funding"
      ```
      The oracles should catch this transaction but will ignore it:
      ```
      bnc-watcher_1  | Fetching new transactions
      bnc-watcher_1  | Sending api transactions request
      bnc-watcher_1  | Found 1 new transactions
      ```
      To check the balance of the bridge account the [Binance Testnet Explorer could be used](https://testnet-explorer.binance.org). It should report about two assets owned by the account.
5. Transfer tokens from Ethereum-based chain to the Binance Chain:
    * (5.1) Modify the parameter `RECEIVER_ADDRESS` in `src/test-services/ethereumSend/.env` as so it contains the Ethereum address of the bridge contract (the same as `HOME_BRIDGE_ADDRESS`) and the parameter `HOME_PRIVATE_KEY` to contain the private key of the first test account (step 1.2)
    * (2.5) Send some amount of tokens to the bridge contract:
      ```
      ./src/test-services/ethereumSend/run.sh 1000000000000000000
      ```


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
