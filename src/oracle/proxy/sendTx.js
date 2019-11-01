const Web3 = require('web3')
const axios = require('axios')
const ethers = require('ethers')
const BN = require('bignumber.js')

const logger = require('./logger')

const { GAS_LIMIT_FACTOR, MAX_GAS_LIMIT } = process.env

function sendRpcRequest(url, method, params) {
  return axios.post(url, {
    jsonrpc: '2.0',
    method,
    params,
    id: 1
  })
    .then((res) => res.data)
    .catch(async () => {
      logger.warn(`Request to ${url}, method ${method} failed, retrying`)
      await new Promise((res) => setTimeout(res, 1000))
      return sendRpcRequest(url, method, params)
    })
}

async function createSender(url, privateKey) {
  const web3 = new Web3(url, null, { transactionConfirmationBlocks: 1 })
  const signer = new ethers.utils.SigningKey(privateKey)

  const chainId = await web3.eth.net.getId()
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
        from: signer.address,
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
      const gasLimit = BN.min(new BN(estimate.result, 16)
        .multipliedBy(GAS_LIMIT_FACTOR), MAX_GAS_LIMIT)
      newTx.gasLimit = `0x${new BN(gasLimit).toString(16)}`
      logger.trace(`Estimated gas to ${gasLimit}`)

      const hash = web3.utils.sha3(ethers.utils.serializeTransaction(tx))
      const signature = signer.signDigest(hash)
      const signedTx = ethers.utils.serializeTransaction(tx, signature)

      const { result, error } = await sendRpcRequest(url, 'eth_sendRawTransaction', [signedTx])
      // handle nonce error
      // handle insufficient funds error
      if (error) {
        logger.debug('Sending signed tx %o failed, %o', tx, error)
        return false
      }

      return {
        txHash: result,
        gasLimit: tx.gasLimit
      }
    } catch (e) {
      logger.warn('Something failed, %o', e)
      return false
    }
  }
}

async function waitForReceipt(url, txHash) {
  while (true) {
    const { result, error } = await sendRpcRequest(url, 'eth_getTransactionReceipt', [txHash])

    if (result === null || error) {
      await new Promise((res) => setTimeout(res, 1000))
    } else {
      return result
    }
  }
}

module.exports = {
  createSender,
  waitForReceipt
}
