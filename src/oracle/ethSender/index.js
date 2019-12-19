const axios = require('axios')
const ethers = require('ethers')
const BN = require('bignumber.js')
const express = require('express')

const logger = require('../shared/logger')
const createProvider = require('../shared/ethProvider')
const { connectRabbit, assertQueue } = require('../shared/amqp')
const { delay, retry } = require('../shared/wait')

const {
  RPC_URL, GAS_LIMIT_FACTOR, MAX_GAS_LIMIT, RABBITMQ_URL, QUEUE_NAME, VALIDATOR_PRIVATE_KEY,
  TO_ADDRESS
} = process.env

const provider = createProvider(RPC_URL)
const wallet = new ethers.Wallet(VALIDATOR_PRIVATE_KEY, provider)

const app = express()

let channel
let chainId
let ready
let nonce

async function sendRpcRequest(method, params) {
  logger.trace(`Request to ${RPC_URL}, method ${method}, params %o`, params)
  const response = await retry(() => axios.post(RPC_URL, {
    jsonrpc: '2.0',
    method,
    params,
    id: 1
  }))
  logger.trace('Response %o', response.data)
  return response.data
}

async function send(tx) {
  const newTx = {
    data: tx.data,
    to: TO_ADDRESS,
    nonce,
    chainId,
    value: '0x00',
    gasPrice: `0x${(tx.gasPrice || 1000000000).toString(16)}`
  }

  try {
    logger.trace(`Preparing and sending transaction %o on ${RPC_URL}`, newTx)
    const estimate = await sendRpcRequest('eth_estimateGas', [{
      from: wallet.address,
      to: newTx.to,
      data: newTx.data,
      gasPrice: newTx.gasPrice,
      value: newTx.value,
      gas: `0x${MAX_GAS_LIMIT.toString(16)}`
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

    const { result, error } = await sendRpcRequest('eth_sendRawTransaction', [signedTx])
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

async function main() {
  nonce = await wallet.getTransactionCount()
  channel = await connectRabbit(RABBITMQ_URL)
  logger.info(`Connecting to send jobs queue ${QUEUE_NAME}`)
  const sendQueue = await assertQueue(channel, QUEUE_NAME)

  while (!ready) {
    await delay(1000)
  }

  channel.prefetch(1)
  sendQueue.consume(async (msg) => {
    const tx = JSON.parse(msg.content)
    const failed = await send(tx)
    if (failed !== true) {
      nonce += 1
    }
    channel.ack(msg)
  })
}

app.get('/start', (req, res) => {
  logger.info('Ready to start')
  ready = true
  res.send()
})
app.listen(8001, () => logger.debug('Listening on 8001'))

main()
