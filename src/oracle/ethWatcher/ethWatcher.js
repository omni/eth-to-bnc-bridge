const Web3 = require('web3')
const utils = require('ethers').utils
const BN = require('bignumber.js')

const logger = require('./logger')
const redis = require('./db')
const { connectRabbit, assertQueue } = require('./amqp')
const { publicKeyToAddress } = require('./crypto')

const abiBridge = require('./contracts_data/Bridge.json').abi

const { HOME_RPC_URL, HOME_BRIDGE_ADDRESS, RABBITMQ_URL, HOME_TOKEN_ADDRESS, HOME_START_BLOCK } = process.env

const web3Home = new Web3(HOME_RPC_URL)
const bridge = new web3Home.eth.Contract(abiBridge, HOME_BRIDGE_ADDRESS)

let channel
let signQueue
let keygenQueue
let cancelKeygenQueue
let blockNumber
let foreignNonce = []
let epoch
let redisTx

async function initialize () {
  channel = await connectRabbit(RABBITMQ_URL)
  signQueue = await assertQueue(channel, 'signQueue')
  keygenQueue = await assertQueue(channel, 'keygenQueue')
  cancelKeygenQueue = await assertQueue(channel, 'cancelKeygenQueue')

  const events = await bridge.getPastEvents('EpochStart', {
    fromBlock: 1
  })
  epoch = events.length ? events[events.length - 1].returnValues.epoch.toNumber() : 0
  logger.info(`Current epoch ${epoch}`)
  const epochStart = events.length ? events[events.length - 1].blockNumber : 1
  const saved = (parseInt(await redis.get('homeBlock')) + 1) || parseInt(HOME_START_BLOCK)
  logger.debug(epochStart, saved)
  if (epochStart > saved) {
    logger.info(`Data in db is outdated, starting from epoch ${epoch}, block #${epochStart}`)
    blockNumber = epochStart
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
        logger.info(`Epoch ${epoch} started`)
        foreignNonce[epoch] = 0
        break
    }
  }

  blockNumber++
  // Exec redis tx
  await redisTx.incr('homeBlock').exec()
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
    threshold: (await bridge.methods.getThreshold(newEpoch).call()).toNumber(),
    parties: (await bridge.methods.getParties(newEpoch).call()).toNumber()
  })
  logger.debug('Sent keygen start event')
}

function sendKeygenCancellation (event) {
  const epoch = event.returnValues.epoch.toNumber()
  cancelKeygenQueue.send({ epoch })
  logger.debug('Sent keygen cancellation event')
}

async function sendSignFundsTransfer (event) {
  const newEpoch = event.returnValues.newEpoch.toNumber()
  const oldEpoch = event.returnValues.oldEpoch.toNumber()
  signQueue.send({
    epoch: oldEpoch,
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
    recipient: publicKeyToAddress({
      x: publicKey.substr(4, 64),
      y: publicKey.substr(68, 64)
    }),
    value: (new BN(event.returnValues.value)).dividedBy(10 ** 18).toFixed(8, 3),
    epoch,
    nonce: foreignNonce[epoch],
    threshold: (await bridge.methods.getThreshold(epoch).call()).toNumber(),
    parties: (await bridge.methods.getParties(epoch).call()).toNumber()
  }

  signQueue.send(msgToQueue)
  logger.debug('Sent new sign event: %o', msgToQueue)

  redisTx.incr(`foreignNonce${epoch}`)
  foreignNonce[epoch]++
}
