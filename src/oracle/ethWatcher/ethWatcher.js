const Web3 = require('web3')
const utils = require('ethers').utils
const BN = require('bignumber.js')
const axios = require('axios')

const logger = require('./logger')
const redis = require('./db')
const { connectRabbit, assertQueue } = require('./amqp')
const { publicKeyToAddress } = require('./crypto')

const abiBridge = require('./contracts_data/Bridge.json').abi

const { HOME_RPC_URL, HOME_BRIDGE_ADDRESS, RABBITMQ_URL, HOME_START_BLOCK } = process.env

const web3Home = new Web3(HOME_RPC_URL)
const bridge = new web3Home.eth.Contract(abiBridge, HOME_BRIDGE_ADDRESS)

let channel
let exchangeQueue
let signQueue
let keygenQueue
let cancelKeygenQueue
let blockNumber
let foreignNonce = []
let epoch
let epochStart
let redisTx
let rangeSize
let lastTransactionBlockNumber

async function resetFutureMessages (queue) {
  logger.debug(`Resetting future messages in queue ${queue.name}`)
  const { messageCount } = await channel.checkQueue(queue.name)
  if (messageCount) {
    logger.info(`Filtering ${messageCount} reloaded messages from queue ${queue.name}`)
    const backup = await assertQueue(channel, `${queue.name}.backup`)
    do {
      const message = await queue.get()
      if (message === false)
        break
      const data = JSON.parse(message.content)
      if (data.blockNumber < blockNumber) {
        logger.debug('Saving message %o', data)
        backup.send(data)
      } else {
        logger.debug('Dropping message %o', data)
      }
      channel.ack(message)
    } while (true)

    logger.debug('Dropped messages came from future')

    do {
      const message = await backup.get()
      if (message === false)
        break
      const data = JSON.parse(message.content)
      logger.debug('Requeuing message %o', data)
      queue.send(data)
      channel.ack(message)
    } while (true)

    logger.debug('Redirected messages back to initial queue')
  }
}

async function initialize () {
  channel = await connectRabbit(RABBITMQ_URL)
  exchangeQueue = await assertQueue(channel, 'exchangeQueue')
  signQueue = await assertQueue(channel, 'signQueue')
  keygenQueue = await assertQueue(channel, 'keygenQueue')
  cancelKeygenQueue = await assertQueue(channel, 'cancelKeygenQueue')

  const events = await bridge.getPastEvents('EpochStart', {
    fromBlock: 1
  })
  epoch = events.length ? events[events.length - 1].returnValues.epoch.toNumber() : 0
  logger.info(`Current epoch ${epoch}`)
  epochStart = events.length ? events[events.length - 1].blockNumber : 1
  const saved = (parseInt(await redis.get('homeBlock')) + 1) || parseInt(HOME_START_BLOCK)
  logger.debug(epochStart, saved)
  if (epochStart > saved) {
    logger.info(`Data in db is outdated, starting from epoch ${epoch}, block #${epochStart}`)
    blockNumber = epochStart
    rangeSize = (await bridge.methods.getRangeSize().call()).toNumber()
    await redis.multi()
      .set('homeBlock', blockNumber - 1)
      .set(`foreignNonce${epoch}`, 0)
      .exec()
    foreignNonce[epoch] = 0
  } else {
    logger.info('Restoring epoch and block number from local db')
    blockNumber = saved
    foreignNonce[epoch] = parseInt(await redis.get(`foreignNonce${epoch}`)) || 0
  }

  await resetFutureMessages(keygenQueue)
  await resetFutureMessages(cancelKeygenQueue)
  await resetFutureMessages(exchangeQueue)
  await resetFutureMessages(signQueue)
  logger.debug(`Sending start commands`)
  await axios.get('http://keygen:8001/start')
  await axios.get('http://signer:8001/start')
}

async function main () {
  logger.debug(`Watching events in block #${blockNumber}`)
  if (await web3Home.eth.getBlock(blockNumber) === null) {
    logger.debug('No block')
    await new Promise(r => setTimeout(r, 1000))
    return
  }

  redisTx = redis.multi()

  const bridgeEvents = await bridge.getPastEvents('allEvents', {
    fromBlock: blockNumber,
    toBlock: blockNumber
  })

  for (const event of bridgeEvents) {
    switch (event.event) {
      case 'NewEpoch':
        await sendKeygen(event)
        break
      case 'NewEpochCancelled':
        sendKeygenCancellation(event)
        break
      case 'NewFundsTransfer':
        await sendSignFundsTransfer(event)
        break
      case 'ExchangeRequest':
        await sendSign(event)
        break
      case 'EpochStart':
        epoch = event.returnValues.epoch.toNumber()
        epochStart = blockNumber
        logger.info(`Epoch ${epoch} started`)
        rangeSize = (await bridge.methods.getRangeSize().call()).toNumber()
        logger.info(`Updated range size to ${rangeSize}`)
        foreignNonce[epoch] = 0
        break
    }
  }

  if ((blockNumber + 1 - epochStart) % rangeSize === 0) {
    logger.info('Reached end of the current block range')

    if (lastTransactionBlockNumber > blockNumber - rangeSize) {
      logger.info('Sending message to start signature generation for the ended range')
      await sendStartSign()
    }
  }

  blockNumber++
  // Exec redis tx
  await redisTx.incr('homeBlock').exec()
  await redis.save()
}

initialize().then(async () => {
  while (true) {
    await main()
  }
})

async function sendKeygen (event) {
  const newEpoch = event.returnValues.newEpoch.toNumber()
  keygenQueue.send({
    epoch: newEpoch,
    blockNumber,
    threshold: (await bridge.methods.getThreshold(newEpoch).call()).toNumber(),
    parties: (await bridge.methods.getParties(newEpoch).call()).toNumber()
  })
  logger.debug('Sent keygen start event')
}

function sendKeygenCancellation (event) {
  const epoch = event.returnValues.epoch.toNumber()
  cancelKeygenQueue.send({
    epoch,
    blockNumber
  })
  logger.debug('Sent keygen cancellation event')
}

async function sendSignFundsTransfer (event) {
  const newEpoch = event.returnValues.newEpoch.toNumber()
  const oldEpoch = event.returnValues.oldEpoch.toNumber()
  signQueue.send({
    epoch: oldEpoch,
    blockNumber,
    newEpoch,
    nonce: foreignNonce[oldEpoch],
    threshold: (await bridge.methods.getThreshold(oldEpoch).call()).toNumber(),
    parties: (await bridge.methods.getParties(oldEpoch).call()).toNumber()
  })
  logger.debug('Sent sign funds transfer event')
  foreignNonce[oldEpoch]++
  redisTx.incr(`foreignNonce${oldEpoch}`)
}

async function sendSign (event) {
  const tx = await web3Home.eth.getTransaction(event.transactionHash)
  const msg = utils.serializeTransaction({
    nonce: tx.nonce,
    gasPrice: `0x${new BN(tx.gasPrice).toString(16)}`,
    gasLimit: `0x${new BN(tx.gas).toString(16)}`,
    to: tx.to,
    value: `0x${new BN(tx.value).toString(16)}`,
    data: tx.input,
    chainId: await web3Home.eth.net.getId()
  })
  const hash = web3Home.utils.sha3(msg)
  const publicKey = utils.recoverPublicKey(hash, { r: tx.r, s: tx.s, v: tx.v })
  const msgToQueue = {
    epoch,
    blockNumber,
    recipient: publicKeyToAddress({
      x: publicKey.substr(4, 64),
      y: publicKey.substr(68, 64)
    }),
    value: (new BN(event.returnValues.value)).dividedBy(10 ** 18).toFixed(8, 3),
    nonce: event.returnValues.nonce.toNumber()
  }

  exchangeQueue.send(msgToQueue)
  logger.debug('Sent new sign event: %o', msgToQueue)

  lastTransactionBlockNumber = blockNumber
  redisTx.set('lastTransactionBlockNumber', blockNumber)
  logger.debug('Set lastTransactionBlockNumber to %d', blockNumber)
}

async function sendStartSign () {
  redisTx.incr(`foreignNonce${epoch}`)
  exchangeQueue.send({
    stub: true
  })
  signQueue.send({
    epoch,
    blockNumber,
    nonce: foreignNonce[epoch]++,
    threshold: (await bridge.methods.getThreshold(epoch).call()).toNumber(),
    parties: (await bridge.methods.getParties(epoch).call()).toNumber()
  })
}
