## Ethereum to Binance Chain bridge demo

These instructions describes how to run the bridge between an Ethereum-based chain and the Binance Chain testnet.

### Ethereum side of the bridge

This demo supports two ways of dealing with the Ethereum side of a bridge:
  - Using development EVM-base chains ([ganache](https://github.com/trufflesuite/ganache-cli))
  - Using public networks (predefined configs use Kovan testnet and Sokol POA testnet)
  
#### Development mode

As part of this demo two EVM-based chains ([ganache](https://github.com/trufflesuite/ganache-cli)) will be started:
  - **Home chain** - it keeps an ERC20 contract (`0xd5fE0D28e058D375b0b038fFbB446Da37E85fFdc`) and the bridge contract (`0x44c158FE850821ae69DaF37AADF5c539e9d0025B`).
  - **Side chain** - the MPC orchestration contract (`0xd5fE0D28e058D375b0b038fFbB446Da37E85fFdc`) is located here
Both chains are run in separate docker containers. 
JSON-RPC ports are mapped to the host (7545 - side chain, 8545 - home chain)

Local Binance network within separate docker container will be used.
In addition, some part of Binance accelerated node [HTTP API](https://docs.binance.org/api-reference/dex-api/paths.html) 
will be emulated, since a regular full-node API does not provide all required features.
APIs and NODE RPC ports are mapped to the host (26657 - RPC, 8080 - api-server, 8000 - emulated accelerated node api)

#### Staging mode

As part of this demo two EVM-based public chains will be used:
  - **Home chain** - Kovan testnet keeps an ERC20 contract and the bridge contract.
  - **Side chain** - Sokol POA testnet keeps the MPC orchestration contract.
Interaction with chains is done by using public available RPC urls.

Public Binance testnet will be used for demo purposes. 
Interaction with chain is done by using a public available HTTP API endpoint.

### Demo validators

Three validators will be run and only two validators are required to confirm the transfer. Every validator node is a set of docker containers (`eth-watcher`, `bnc-watcher`, `signer`, `proxy`, `redis`, `rabbitmq`).

### Binance side of the bridge

The public Binance Chain testnet will keep a BEP2 token.

### Running demo in development mode

1. Preparation
    * (1.1) Clone the repo and initialize git submodules:
      ```
      git clone --recurse-submodules https://github.com/k1rill-fedoseev/eth-to-bnc-bridge.git
      ```
    * (1.2) Build TSS to be used in the bridge oracles:
      ```
      docker build -t tss ./src/tss
      ```
    * (1.3) Generate several private keys for bridge testing. (e. g. `openssl rand -hex 32`)
    * (1.4) Get Ethereum and Binance addresses for recently created accounts via running 
      ```
      ./src/test-services/getAddresses/run.sh <PRIVATE_KEY>
      ```
2. Run test environment
    * (2.1) Modify `src/contracts/home/deploy/.env.development` and specify the amount of tokens to mint in the parameter `TOKEN_INITIAL_MINT`.
    * (2.2) Run Ethereum testnets and deploy contracts
      ```
      TARGET_NETWORK=development ./demo/start-ethereum-environment.sh
      ```
      This command will also mint tokens, the owner of tokens is the address that corresponds to the 
      private key specified in `HOME_PRIVATE_KEY` of `src/contracts/home/deploy/.env.development` (`0xA374DC09057D6B3253d04fACb15736B43fBc7943`).
    * (2.4) Run Binance testnet and api services
      ```
      ./demo/start-binance-environment.sh
      ```
      This command will also issue a BEP2 token, the owner of tokens is the address that corresponds to the 
      private key specified in `FOREIGN_PRIVATE_KEY` of `src/test-services/binanceSend/.env.development` (`tbnb1z7u9f8mcuwxanns9xa6qgjtlka0d392epc0m9x`).
      The balance of `tbnb1z7u9f8mcuwxanns9xa6qgjtlka0d392epc0m9x` will contain 10000 BNB and 10000 Test Tokens.
    * (2.5) Send few tokens and coins from the current token owner to the first account. Coins are needed to pay transaction fees.
      ```
      ./src/test-services/ethereumSend/run.sh <first account Ethereum address> 5 0.5
      ```
    * (2.6) Check that the tokens were transferred properly:
      ```
      ./src/test-services/ethereumBalance/run.sh <first account Ethereum address>
      ``` 
3. Run validators nodes:
    * (3.1) Run three validators in separate terminal sessions.
      ```
      N=1 ./demo/validator-demo.sh
      N=2 ./demo/validator-demo.sh
      N=3 ./demo/validator-demo.sh
      ```
      Wait for when the line like the following appears:
      ```
      keygen_1 | Generated multisig account in binance chain: tbnb1mutgnx9n9devmrjh3d0wz332fl8ymgel6tydx6
      ```
      The line contains the address of the bridge address in the Binance Chain.
4. Initialize the state of the bridge account in the Binance Chain
    * (4.1) Fill the balance Fund with BNB coins as so the account will be able to make transactions:
      ```
      ./src/test-services/binanceSend/run.sh  <address of the bridge account> 100 1
      ```
      To check the balance of the bridge account use `./src/test-services/binanceBalance/run.sh <address of the bridge account>`
5. Transfer tokens from Ethereum-based chain to the Binance Chain:
    * (5.1) Send some amount of tokens to the bridge contract, for `PRIVATE_KEY` use some of the keys from step (1.3):
      ```
      PRIVATE_KEY=<test account private key> ./src/test-services/ethereumSend/run.sh bridge 5
      ```
    * (5.2) The validators will catch the event and start the process to sign the transaction.
    * (5.3) As soon as the signature is generated and sent, the balance of the bridge account in both chains will be changed:
      ```
      ./src/test-services/ethereumBalance/run.sh <ethereum bridge address>
      ```
      should report non-zero balance,
      ```
      ./src/test-services/binanceBalance/run.sh <binance bridge address>
      ```
      should report about the balance reduction.
    * (5.4) Check that the tokens were transferred properly to the test account:
      ```
      ./src/test-services/binanceBalance/run.sh <test account address>
      ```
6. Transfer tokens from the Binance Chain to Ethereum-based chain:
    * (6.1) Send some amount of tokens to the bridge account:
      ```
      PRIVATE_KEY=<test account private key> ./src/test-services/binanceSend/run.sh <binance bridge address> 3
      ```
    * (6.2) Check the balances of the test account on both sides of the bridge to see that the funds were transferred properly using commands from (5.3), (5.4).
7. Bridge supports changing the list of validators and required voting threshold via voting process, and then keys regeneration.
    * (7.0) Obtain information about current epoch, current list validators, upcoming epoch information, bridge state via:
      ```
      curl http://localhost:$PORT/info
      ```
      Where `$PORT` is specific port for some validator oracle.
      The response object contains lots of useful information about current bridge state.
      ```json5
        {
          // current epoch number, in which bridge is operating
          "epoch": 2, 
      
          // next epoch number, for which votes and keygen operations are applied
          "nextEpoch": 3,
      
          // threshold number for current epoch, 
          // at least threshold votes are required for any changes in next epoch
          "threshold": 2, 
      
          // threshold number for next epoch
          "nextThreshold": 2,
      
          // current bridge addresses in home and foreign networks
          "homeBridgeAddress": "0x44c158FE850821ae69DaF37AADF5c539e9d0025B",
          "foreignBridgeAddress": "tbnb19z22khee969yj05dckg9usvmwndkucpyl543xk",
      
          // current set of validators
          "validators": [
            "0x99Eb3D86663c6Db090eFFdBC20510Ca9f836DCE3",
            "0x6352e3e6038e05b9da00C84AE851308f9774F883"
          ],
      
          // set of validators for the next epoch
          "nextValidators": [
            "0x99Eb3D86663c6Db090eFFdBC20510Ca9f836DCE3",
            "0x6352e3e6038e05b9da00C84AE851308f9774F883",
            "0xAa006899B0EC407De930bA8A166DEfe59bBfd3DC"
          ],
      
          // balances of bridge in both networks
          "homeBalance": 50,
          "foreignBalanceTokens": 100,
          "foreignBalanceNative": 0.0994,
      
          // current bridge status, can be one of: ready, voting, keygen, funds_transfer
          "bridgeStatus": "ready",
      
          // current votes count for starting voting, starting/cancelling keygen
          // -1 means that enough confirmations are already collected
          "votesForVoting": 0,
          "votesForKeygen": 0,
          "votesForCancelKeygen": 0,
      
          // collected confirmations for changing epoch to nextEpoch
          // -1 means that enough confirmations are already collected
          "confirmationsForFundsTransfer": 0
        }
      ``` 
    * (7.1) Start voting process for next epoch, via sending `$THRESHOLD` requests to `/vote/startVoting` url. Bridge 
      state should be successfully changed to `voting`.
    * 7.2 Changing next epoch bridge validators / threshold
        * (7.2.1) Add / remove validator in next validators list, via sending `$THRESHOLD` requests to 
          `/vote/addValidator/$ADDRESS` / `/vote/removeValidator/$ADDRESS`.
        * (7.2.2) Change threshold for the next epoch, via sending `$THRESHOLD` requests to `/vote/changeThreshold/$THRESHOLD`.
    * (7.3) Start keygen process for next epoch, via sending `$THRESHOLD` requests to `/vote/startKeygen` url. Bridge 
      state should be successfully changed to `keygen`, and in some time to `funds_transfer`, and then to `ready`.
    * (7.4) If keygen process at some state was stopped(i. e. one validator turned off his oracle), 
      it can be cancelled via via sending `$THRESHOLD` requests to `/vote/cancelKeygen` url. After
      keygen cancellation, bridge state will return to `voting`, and later it can be restarted manually 
      once again.

### Running demo in staging mode

Staging mode demo is similar to development mode demo, but requires additional manual actions for preparing demo.
Make sure, to first run demo in development mode, before trying to run it in the staging environment. 

1. Preparation
    * (1.1) Download `tbnbcli` from https://github.com/binance-chain/node-binary/tree/master/cli.
    * (1.2) Create a new account through the [web-interface](https://testnet.binance.org/en/create) in the Binance testnet wallet. Copy the private key and mnemonic phrase. The private key will be used to import it in an Ethereum Wallet. The mnemonic phrase is to recover the BNB with `tbnbcli`.
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
      docker build -t tss ./src/tss
      ```
2. Run test environment
    * (2.1) Prepare three private keys for validators. Get the Ethereum account addresses for these keys.
    * (2.2) Modify `src/contracts/home/deploy/.env.staging` and specify the token contract address in 
    the Kovan network via `HOME_TOKEN_ADDRESS` (use empty address `0x` if you want to create new 
    ERC20 contract while deployment). \
    Set `VALIDATOR_ADDRESS_*` to Ethereum addresses obtained in the previous step. 
    * (2.3) Modify `src/contracts/.keys.staging` and specify private keys for prefunded accounts in both networks.
    These accounts are used for contract deployment. Use `src/contracts/.keys.staging.example` as an example.
    * (2.4) Deploy contracts
      ```
      TARGET_NETWORK=staging ./demo/start-ethereum-environment.sh
      ```
      This command will deploy ERC20 contract and also mint tokens if you left `HOME_TOKEN_ADDRESS` empty,
      the owner of tokens is the address that corresponds to the private key specified in 
      `HOME_PRIVATE_KEY` of `src/contracts/.keys.staging`.\
      Deployed contract addresses will be automatically updated in all required validators 
      and test services configs.
    * (2.5) Prefund validator accounts in home network (Kovan):
      ```
      TARGET_NETWORK=staging ./src/test-services/ethereumSend/run.sh <Nth validator address> 0 0.5
      ```
    * (2.6) Prefund validator accounts in side network (Sokol):
      ```
      TARGET_NETWORK=staging ./src/test-services/sidePrefund/run.sh <Nth validator address> 1
      ```
    * (2.7) Send few tokens and coins from the current token owner to the first account. Coins are needed to pay transaction fees.
      ```
      TARGET_NETWORK=staging ./src/test-services/ethereumSend/run.sh <first account Ethereum address> 5 0.5
      ```
    * (2.8) Check that the tokens were transferred properly:
      ```
      TARGET_NETWORK=staging ./src/test-services/ethereumBalance/run.sh <first account Ethereum address>
      ``` 
3. Run validators nodes:
    * (3.1) Modify the parameter `FOREIGN_ASSET` in `demo/validator1/.env.staging`, `demo/validator2/.env.staging` 
    and `demo/validator3/.env.staging` to the identificator of the token (step 1.8) that the oracle will track. \
    For staging environment additionally specify `VALIDATOR_PRIVATE_KEY` in the `demo/validator<N>/.keys.staging` (step 2.2.1)
    * (3.2) Run three validators in separate terminal sessions.
      ```
      N=1 TARGET_NETWORK=staging ./demo/validator-demo.sh
      N=2 TARGET_NETWORK=staging ./demo/validator-demo.sh
      N=3 TARGET_NETWORK=staging ./demo/validator-demo.sh
      ```
      Wait for when the line like the following appears:
      ```
      keygen_1 | Generated multisig account in binance chain: tbnb1mutgnx9n9devmrjh3d0wz332fl8ymgel6tydx6
      ```
      The line contains the address of the bridge address in the Binance Chain.
4. Initialize the state of the bridge account in the Binance Chain
    * (4.1) Fill the balance Fund with BNB coins as so the account will be able to make transactions:
      ```
      ./src/test-services/binanceSend/run.sh  <address of the bridge account> 100 1
      ```
    To check the balance of the bridge account use `./src/test-services/binanceBalance/run.sh` 
    or [Binance Testnet Explorer](https://testnet-explorer.binance.org). It should report about two assets owned by the account.
5. Transfer tokens from Ethereum-based chain to the Binance Chain:
    * (5.1) Send some amount of tokens to the bridge contract, for `PRIVATE_KEY` use some of the keys from step (1.3):
      ```
      TARGET_NETWORK=staging PRIVATE_KEY=<test account private key> ./src/test-services/ethereumSend/run.sh bridge 5
      ```
    * (5.2) The validators will catch the event and start the process to sign the transaction.
    * (5.3) As soon as the signature is generated and sent, the balance of the bridge account in both chains will be changed:
      ```
      ./src/test-services/ethereumBalance/run.sh <ethereum bridge address>
      ```
      should report non-zero balance,
      ```
      ./src/test-services/binanceBalance/run.sh <binance bridge address>
      ```
      should report about the balance reduction.
    * (5.4) Check that the tokens were transferred properly to the test account:
      ```
      ./src/test-services/binanceBalance/run.sh <test account address>
      ```
      The balance and transactions related to the bridge account in the Binance Chain could be checked in 
      [Binance Testnet Explorer](https://testnet-explorer.binance.org).
6. Transfer tokens from the Binance Chain to Ethereum-based chain:
    * (6.1) Send some amount of tokens to the bridge account:
      ```
      TARGET_NETWORK=staging PRIVATE_KEY=<test account private key> ./src/test-services/binanceSend/run.sh <binance bridge address> 3
      ```
    * (6.2) Check the balances of the test account on both sides of the bridge to see that the funds were transferred properly using commands from (5.3), (5.4). 
7. Steps for updating validators list are exactly the same for both demo modes. Check the steps from development mode.

### Finish demo

1. Stop all validator instances by pressing `^C` in the terminal.
2. Stop the local testnets (if any):
   ```
   docker kill binance-testnet_http-api_1
   docker kill binance-testnet_node_1
   docker kill binance-testnet_api-server_1
   docker kill ethereum-testnet_ganache_home_1
   docker kill ethereum-testnet_ganache_side_1
   docker kill ethereum-testnet_side-oracle_1
   ```
3. Remove testnets and validators data:
   ```
   TARGET_NETWORK=development ./demo/clean.sh
   ```

#### Testing tools for both sides of the bridge

In these tools, `run.sh` file simply builds and runs a docker container for interacting with test blockchains. Every tool contains the file `.env` where parameters (RPC urls and private keys) are kept.
* `./src/test-services/binanceSend/run.sh TO TOKENS NATIVE` 
    - Sends specified amount of tokens and BNBs to the bridge account.
    - `TO` - receiver address in the Binance Chain.
    - `TOKENS` - amount of tokens to send.
    - `NATIVE` - amount of BNB tokens to send, if present, the 
    transaction is considered as a funding one.
* `./src/test-services/ethereumSend/run.sh TO TOKENS NATIVE`
    - Transfers specified amount of tokens and coins to the an Ethereum account on the home network.
    - `TO` - receiver address in the Ethereum-based chain, specify `bridge` to send tokens to the bridge address.
    - `VALUE` - amount of tokens to transfer and exchange.
    - `NATIVE` - amount of coins to send (in `ether`). Could be omitted.
* `./src/test-services/sidePrefund/run.sh TO NATIVE`
    - Transfers specified amount of tokens and coins to the an Ethereum account on the side network.
    - `TO` - receiver address in the Ethereum-based chain.
    - `NATIVE` - amount of coins to send (in `ether`). Could be omitted.
* `./src/test-services/binanceBalance/run.sh ADDRESS` (it is recommended to use `tbnbcli` instead)
    - Gets current BEP2 token and BNB balances of the specified account.
    - `ADDRESS` - account address in the Binance Chain.
* `./src/test-services/ethereumBalance/run.sh ADDRESS`
    - Gets current ERC20 token balance of the specified account.
    - `ADDRESS` - Ethereum address of the account.

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
        - `ADDRESS` - Ethereum address of a validator.
        - After enough votes are collected, validator is added into 
        the next validators list for the next epoch.
    - http://localhost:5001/vote/removeValidator/ADDRESS
        - `ADDRESS` - Ethereum address of a validator.
        - After enough votes are collected, validator is removed from
        the next validators list for the next epoch.
    - http://localhost:5001/vote/changeThreshold/THRESHOLD
        - `THRESHOLD` - Number. New threshold value.
        - After enough votes are collected, new threshold is set for next epoch.
    - http://localhost:5001/vote/changeCloseEpoch/CLOSE_EPOCH
        - `CLOSE_EPOCH` - Boolean. Next epoch close epoch policy 
        (If true, next validators set will first disable binance account for previous 
        epoch, before moving onto a new one).
        - After enough votes are collected, new close policy is set for the next epoch.
