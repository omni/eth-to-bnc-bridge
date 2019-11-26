const axios = require('axios')
const ethers = require('ethers')
const BN = require('bignumber.js')

const logger = require('./logger')
const { delay, retry } = require('./wait')

const { GAS_LIMIT_FACTOR, MAX_GAS_LIMIT } = process.env

async function sendRpcRequest(url, method, params) {
  logger.trace(`Request to ${url}, method ${method}, params %o`, params)
  const response = await retry(() => axios.post(url, {
    jsonrpc: '2.0',
    method,
    params,
    id: 1
  }))
  logger.trace('Response %o', response.data)
  return response.data
}

async function createSender(url, privateKey) {
  const provider = new ethers.providers.JsonRpcProvider(url)
  const wallet = new ethers.Wallet(privateKey, provider)

  const { chainId } = await provider.getNetwork()
  return async function send(tx) {
    const newTx = {
      data: tx.data,
      to: tx.to,
      nonce: tx.nonce,
      chainId,
      value: `0x${new BN(tx.value || 0).toString(16)}`,
      gasPrice: `0x${new BN(tx.gasPrice || 1000000000).toString(16)}`
    }

    try {
      logger.trace(`Preparing and sending transaction %o on ${url}`, newTx)
      const estimate = await sendRpcRequest(url, 'eth_estimateGas', [{
        from: wallet.address,
        to: newTx.to,
        data: newTx.data,
        gasPrice: newTx.gasPrice,
        value: newTx.value,
        gas: `0x${new BN(MAX_GAS_LIMIT).toString(16)}`
      }])

      if (estimate.error) {
        logger.debug('Gas estimate failed %o, skipping tx, reverting nonce', estimate.error)
        return true
      }
      const gasLimit = BN.min(
        new BN(estimate.result, 16).multipliedBy(GAS_LIMIT_FACTOR),
        MAX_GAS_LIMIT
      )
      newTx.gasLimit = `0x${new BN(gasLimit).toString(16)}`
      logger.trace(`Estimated gas to ${gasLimit}`)

      const signedTx = await wallet.sign(newTx)

      const { result, error } = await sendRpcRequest(url, 'eth_sendRawTransaction', [signedTx])
      // handle nonce error
      // handle insufficient funds error
      if (error) {
        logger.debug('Sending signed tx %o failed, %o', tx, error)
        return false
      }

      return {
        txHash: result,
        gasLimit: newTx.gasLimit
      }
    } catch (e) {
      logger.warn('Something failed, %o', e)
      return false
    }
  }
}

async function waitForReceipt(url, txHash) {
  const provider = new ethers.providers.JsonRpcProvider(url)
  while (true) {
    const receipt = await provider.getTransactionReceipt(txHash)

    if (receipt) {
      return receipt
    }

    await delay(1000)
  }
}

module.exports = {
  createSender,
  waitForReceipt
}
