[![CircleCI](https://circleci.com/gh/poanetwork/eth-to-bnc-bridge/tree/master.svg?style=svg)](https://circleci.com/gh/poanetwork/eth-to-bnc-bridge/tree/master)

## Ethereum to Binance Chain bridge

This repository contains a proof-of-concept for ERC20-to-BEP2 bridge.

https://forum.poa.network/t/ethereum-to-binance-chain-bridge/2696

The bridge is able to transfer an ERC20 tokens on an EVM-based chain to BEP2 to the Binance Chain and vice versa.

It includes the following components:
1. The bridge contract on an EVM-based chain that is responsible to receive and release ERC20 tokens 
2. The orchestration contract on an EVM-based chain that participate in MPC (multy-party computations) to generate a threshold signature.
3. The oracle that monitors the chains and the send transactions. One oracle represents one bridge validator (one private key).

The idea of the bridge is similar to [the token bridge](https://github.com/poanetwork/tokenbridge) produced by [POA.Network](https://poa.network/):
- every oracle sends its confirmation as soon as a user sends the token relay request in one chain.
- when enough confirmations collected the requested amount of tokens is unlocked in another chain.

Collecting confirmations for the Binance Chain is made in form of mutlisig wallet - the validator's confirmation is participation in the transaction signature gneration with usage of Threshold Signature Scheme (TSS) implemented for ECDSA by [KZen Research team](https://github.com/KZen-networks/multi-party-ecdsa).

At this version the tool for TSS is used as is. It is assumed that later part of TSS orchestration will be moved to the orchestration contract. So far, the orchestration contract is used as a database to keep data required by TSS parties during the signature generation.

Read [an instruction how to run a demo](DEMO.md) for the bridge.
