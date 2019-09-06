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

#### Staging mode

As part of this demo two EVM-based public chains will be used:
  - **Home chain** - Kovan testnet keeps an ERC20 contract and the bridge contract.
  - **Side chain** - Sokol POA testnet keeps the MPC orchestration contract.
Interaction with chains is done by using public available RPC urls.

### Demo validators

Three validators will be run and only two validators are required to confirm the transfer. Every validator node is a set of docker containers (`eth-watcher`, `bnc-watcher`, `signer`, `proxy`, `redis`, `rabbitmq`).

### Binance side of the bridge

The public Binance Chain testnet will keep a BEP2 token.

### Running demo

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
      docker build -t tss -f ./src/tss/Dockerfile-local ./src/tss
      ```
2. Run test environment
    * 2.1 Running in development mode (using local ganache networks):
        * (2.1.1) Modify `src/deploy/deploy-test/.env.development` and specify the amount of tokens to mint in the parameter `TOKEN_INITIAL_MINT`.
        * (2.1.2) Run testnets and deploy contracts
          ```
          TARGET_NETWORK=development ./demo/start-environment.sh
          ```
          This command will also mint tokens, the owner of tokens is the address that corresponds to the 
          private key specified in `HOME_PRIVATE_KEY` of `src/deploy/deploy-test/.env.development` (`0xA374DC09057D6B3253d04fACb15736B43fBc7943`).
     * 2.2 Running in staging mode (using public test networks):
        * (2.2.1) Prepare three private keys for validators. Get the Ethereum account addresses for these keys.
        * (2.2.2) Modify `src/deploy/deploy-home/.env.staging` and specify the token contract address in 
        the Kovan network via `HOME_TOKEN_ADDRESS` (use empty address `0x` if you want to create new 
        ERC20 contract while deployment). \
        Set `VALIDATOR_ADDRESS_*` to Ethereum addresses obtained in the previous step. 
        * (2.2.3) Modify `src/deploy/.keys.staging` and specify private keys for prefunded accounts in both networks.
        These accounts are used for contract deployment. Use `src/deploy/.keys.staging.example` as an example.
        * (2.2.4) Deploy contracts
          ```
          TARGET_NETWORK=staging ./demo/start-environment.sh
          ```
          This command will deploy ERC20 contract and also mint tokens if you left `HOME_TOKEN_ADDRESS` empty,
          the owner of tokens is the address that corresponds to the private key specified in 
          `HOME_PRIVATE_KEY` of `src/deploy/.keys.staging`.\
          Deployed contract address will be automatically updates in all required validators 
          and test services configs.
        * (2.2.5) Prefund validator accounts in home network (Kovan):
          ```
          TARGET_NETWORK=staging ./src/test-services/ethereumSend/run.sh <Nth validator address> 0 0.5
          ```
        * (2.2.6) Prefund validator accounts in side network (Sokol):
          ```
          TARGET_NETWORK=staging ./src/test-services/sidePrefund/run.sh <Nth validator address> 1
          ```
    * (2.3) Get the Ethereum account address for the first test account from its private key (step 1.2). [NiftyWallet](https://forum.poa.network/c/nifty-wallet) could be used for this.
    * (2.4) Send few tokens and coins from the current token owner to the first account. Coins are needed to pay transaction fees.
      ```
      TARGET_NETWORK=<target network> ./src/test-services/ethereumSend/run.sh <first account Ethereum address> 5000000000000000000 0.5
      ```
    * (2.5) Check that the tokens were transferred properly:
      ```
      TARGET_NETWORK=<target network> ./src/test-services/ethereumBalance/run.sh <first account Ethereum address>
      ``` 
3. Run validators nodes:
    * (3.1) Modify the parameter `FOREIGN_ASSET` in `demo/validator1/.env.<network>`, `demo/validator2/.env.<network>` 
    and `demo/validator3/.env.<network>` to specify the identificator of the token (step 1.8) that the oracle will watch. \
    For staging environment additionally specify `VALIDATOR_PRIVATE_KEY` in the `demo/validator<N>/.keys.staging` (step 2.2.1)
    * (3.2) Run three validators in separate terminal sessions.
      ```
      N=1 TARGET_NETWORK=<network> ./demo/validator-demo.sh
      N=2 TARGET_NETWORK=<network> ./demo/validator-demo.sh
      N=3 TARGET_NETWORK=<network> ./demo/validator-demo.sh
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
      To check the balance of the bridge account the [Binance Testnet Explorer](https://testnet-explorer.binance.org) could be used. It should report about two assets owned by the account.
5. Transfer tokens from Ethereum-based chain to the Binance Chain:
    * (5.1) Modify  the parameter `HOME_PRIVATE_KEY`
    (in `src/test-services/ethereumSend/.env.development` or `src/test-services/.keys.staging`)
    as so it contains the private key of the first test account (step 1.2)
    * (5.2) Send some amount of tokens to the bridge contract:
      ```
      TARGET_NETWORK=<network> ./src/test-services/ethereumSend/run.sh bridge 5000000000000000000
      ```
    * (5.3) The validators will catch the event and start the process to sign the transaction.
    * (5.4) As soon as the signature is generated and sent, the balance of the bridge account in both chains will be changed:
      ```
      TARGET_NETWORK=<network> ./src/test-services/ethereumBalance/run.sh 0x94b40CC641Ed7db241A1f04C8896ba6f6cC36b85
      ```
      should report non-zero balance
      ```
      ./tbnbcli account <address of the bridge account> \
        --chain-id=Binance-Chain-Nile --node=data-seed-pre-2-s1.binance.org:80 --trust-node
      ```
      should report about the balance reduction.
      The balance and transactions related to the bridge account in the Binance Chain could be checked in [Binance Testnet Explorer](https://testnet-explorer.binance.org).
    * (5.5) Check that the tokens was transferred to the first test account either by `tbnbcli` or by [Binance Testnet Explorer](https://testnet-explorer.binance.org).
6. Transfer tokens from the Binance Chain to Ethereum-based chain:
    * Use either `tbnbcli` or the [Binance testnet wallet](https://testnet.binance.org/) to send tokens to the bridge account:
      ```
      ./tbnbcli send --from test_account1 --to <address of the bridge account> \ 
        --amount 300000000:ETB0819-863 --chain-id=Binance-Chain-Nile \
        --node=data-seed-pre-2-s1.binance.org:80 --memo "any note"
      ```
    * Check the balances of the test account on both sides of the bridge to see that the funds were transferred properly. 

### Finish demo

1. Stop all validator instances by pressing `^C` in the terminal.
2. Stop the local testnets:
   ```
   docker kill ganache_home
   docker kill ganache_side
   ```
3. Remove virtual networks:
   ```
   docker network rm blockchain_home
   docker network rm blockchain_side
   docker network rm validator1_test_network
   docker network rm validator2_test_network
   docker network rm validator3_test_network
   ```
4. Remove testnets and validators data:
   ```
   TARGET_NETWORK=<network> ./demo/clean.sh
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
    - http://localhost:5001/vote/addValidator/ADDRESS
        - `ADDRESS` - Ethereum address of a validator.
        - After enough votes are collected, validator is removed from
        the next validators list for the next epoch.
