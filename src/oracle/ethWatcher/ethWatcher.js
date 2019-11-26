const ethers = require('ethers')
const BN = require('bignumber.js')
const axios = require('axios')

const logger = require('./logger')
const redis = require('./db')
const { connectRabbit, assertQueue } = require('./amqp')
const { publicKeyToAddress } = require('./crypto')
const { delay, retry } = require('./wait')

const {
  HOME_RPC_URL, HOME_BRIDGE_ADDRESS, RABBITMQ_URL, HOME_START_BLOCK, VALIDATOR_PRIVATE_KEY
} = process.env
const HOME_MAX_FETCH_RANGE_SIZE = parseInt(process.env.HOME_MAX_FETCH_RANGE_SIZE, 10)

const provider = new ethers.providers.JsonRpcProvider(HOME_RPC_URL)
const bridgeAbi = [
  'event ExchangeRequest(uint96 value, uint32 nonce)',
  'event EpochEnd(uint16 indexed epoch)',
  'event NewEpoch(uint16 indexed oldEpoch, uint16 indexed newEpoch)',
  'event NewEpochCancelled(uint16 indexed epoch)',
  'event NewFundsTransfer(uint16 indexed oldEpoch, uint16 indexed newEpoch)',
  'event EpochStart(uint16 indexed epoch, uint256 x, uint256 y)',
  'event EpochClose(uint16 indexed epoch)',
  'event ForceSign()',
  'function getX(uint16 epoch) view returns (uint256)',
  'function getY(uint16 epoch) view returns (uint256)',
  'function getThreshold(uint16 epoch) view returns (uint16)',
  'function getParties(uint16 epoch) view returns (uint16)',
  'function getRangeSize(uint16 epoch) view returns (uint16)',
  'function getValidators(uint16 epoch) view returns (address[])'
]
const bridge = new ethers.Contract(HOME_BRIDGE_ADDRESS, bridgeAbi, provider)
const validatorAddress = ethers.utils.computeAddress(`0x${VALIDATOR_PRIVATE_KEY}`)

const foreignNonce = []
let channel
let exchangeQueue
let signQueue
let keygenQueue
let cancelKeygenQueue
let epochTimeIntervalsQueue
let chainId
let blockNumber
let epoch
let epochStart
let redisTx
let rangeSize
let lastTransactionBlockNumber
let isCurrentValidator
let activeEpoch

async function getBlockTimestamp(n) {
  return (await provider.getBlock(n, false)).timestamp
}

async function resetFutureMessages(queue) {
  logger.debug(`Resetting future messages in queue ${queue.name}`)
  const { messageCount } = await channel.checkQueue(queue.name)
  if (messageCount) {
    logger.info(`Filtering ${messageCount} reloaded messages from queue ${queue.name}`)
    const backup = await assertQueue(channel, `${queue.name}.backup`)
    while (true) {
      const message = await queue.get()
      if (message === false) {
        break
      }
      const data = JSON.parse(message.content)
      if (data.blockNumber < blockNumber) {
        logger.debug('Saving message %o', data)
        backup.send(data)
      } else {
        logger.debug('Dropping message %o', data)
      }
      channel.ack(message)
    }

    logger.debug('Dropped messages came from future')

    while (true) {
      const message = await backup.get()
      if (message === false) {
        break
      }
      const data = JSON.parse(message.content)
      logger.debug('Requeuing message %o', data)
      queue.send(data)
      channel.ack(message)
    }

    logger.debug('Redirected messages back to initial queue')
  }
}

async function sendKeygen(event) {
  const { newEpoch } = event.values
  const [threshold, parties] = await Promise.all([
    bridge.getThreshold(newEpoch),
    bridge.getParties(newEpoch)
  ])
  keygenQueue.send({
    epoch: newEpoch,
    blockNumber,
    threshold,
    parties
  })
  logger.debug('Sent keygen start event')
}

function sendKeygenCancellation(event) {
  const eventEpoch = event.values.epoch
  cancelKeygenQueue.send({
    epoch: eventEpoch,
    blockNumber
  })
  logger.debug('Sent keygen cancellation event')
}

async function sendSignFundsTransfer(event) {
  const { newEpoch, oldEpoch } = event.values
  const [
    x, y, threshold, parties
  ] = await Promise.all([
    bridge.getX(newEpoch).then((value) => new BN(value).toString(16)),
    bridge.getY(newEpoch).then((value) => new BN(value).toString(16)),
    bridge.getThreshold(oldEpoch),
    bridge.getParties(oldEpoch)
  ])
  const recipient = publicKeyToAddress({
    x,
    y
  })
  signQueue.send({
    epoch: oldEpoch,
    blockNumber,
    newEpoch,
    nonce: foreignNonce[oldEpoch],
    recipient,
    threshold,
    parties
  })
  logger.debug('Sent sign funds transfer event')
  foreignNonce[oldEpoch] += 1
  redisTx.incr(`foreignNonce${oldEpoch}`)
}

async function sendSign(event, transactionHash) {
  const tx = await provider.getTransaction(transactionHash)
  const msg = ethers.utils.serializeTransaction({
    nonce: tx.nonce,
    gasPrice: tx.gasPrice,
    gasLimit: tx.gasLimit,
    to: tx.to,
    data: tx.data,
    chainId
  })
  const hash = ethers.utils.keccak256(msg)
  const publicKey = ethers.utils.recoverPublicKey(hash, {
    r: tx.r,
    s: tx.s,
    v: tx.v
  })
  const msgToQueue = {
    epoch,
    blockNumber,
    recipient: publicKeyToAddress({
      x: publicKey.substr(4, 64),
      y: publicKey.substr(68, 64)
    }),
    value: (new BN(event.values.value)).dividedBy(10 ** 18).toFixed(8, 3),
    nonce: event.values.nonce
  }

  exchangeQueue.send(msgToQueue)
  logger.debug('Sent new sign event: %o', msgToQueue)

  lastTransactionBlockNumber = blockNumber
  redisTx.set('lastTransactionBlockNumber', blockNumber)
  logger.debug(`Set lastTransactionBlockNumber to ${blockNumber}`)
}

async function sendStartSign() {
  const [threshold, parties] = await Promise.all([
    bridge.getThreshold(epoch),
    bridge.getParties(epoch)
  ])
  signQueue.send({
    epoch,
    blockNumber,
    nonce: foreignNonce[epoch],
    threshold,
    parties
  })
  foreignNonce[epoch] += 1
  redisTx.incr(`foreignNonce${epoch}`)
}

async function processEpochStart(event) {
  epoch = event.values.epoch
  epochStart = blockNumber
  logger.info(`Epoch ${epoch} started`)
  rangeSize = await bridge.getRangeSize(epoch)
  isCurrentValidator = (await bridge.getValidators(epoch)).includes(validatorAddress)
  if (isCurrentValidator) {
    logger.info(`${validatorAddress} is a current validator`)
  } else {
    logger.info(`${validatorAddress} is not a current validator`)
  }
  logger.info(`Updated range size to ${rangeSize}`)
  foreignNonce[epoch] = 0
}

async function sendEpochClose() {
  logger.debug(`Consumed epoch ${epoch} close event`)
  const [threshold, parties] = await Promise.all([
    bridge.getThreshold(epoch),
    bridge.getParties(epoch)
  ])
  signQueue.send({
    closeEpoch: epoch,
    blockNumber,
    nonce: foreignNonce[epoch],
    threshold,
    parties
  })
  foreignNonce[epoch] += 1
  redisTx.incr(`foreignNonce${epoch}`)
}

async function initialize() {
  channel = await connectRabbit(RABBITMQ_URL)
  exchangeQueue = await assertQueue(channel, 'exchangeQueue')
  signQueue = await assertQueue(channel, 'signQueue')
  keygenQueue = await assertQueue(channel, 'keygenQueue')
  cancelKeygenQueue = await assertQueue(channel, 'cancelKeygenQueue')
  epochTimeIntervalsQueue = await assertQueue(channel, 'epochTimeIntervalsQueue')

  activeEpoch = !!(await redis.get('activeEpoch'))

  chainId = (await provider.getNetwork()).chainId

  const events = (await provider.getLogs({
    address: HOME_BRIDGE_ADDRESS,
    fromBlock: 1,
    toBlock: 'latest',
    topics: bridge.filters.EpochStart().topics
  })).map((log) => bridge.interface.parseLog(log))

  epoch = events.length ? events[events.length - 1].values.epoch : 0
  logger.info(`Current epoch ${epoch}`)
  epochStart = events.length ? events[events.length - 1].blockNumber : 1
  const saved = (parseInt(await redis.get('homeBlock'), 10) + 1) || parseInt(HOME_START_BLOCK, 10)
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
    foreignNonce[epoch] = parseInt(await redis.get(`foreignNonce${epoch}`), 10) || 0
  }
  rangeSize = await bridge.getRangeSize(epoch)
  logger.debug(`Range size ${rangeSize}`)
  logger.debug('Checking if current validator')
  isCurrentValidator = (await bridge.getValidators(epoch)).includes(validatorAddress)
  if (isCurrentValidator) {
    logger.info(`${validatorAddress} is a current validator`)
  } else {
    logger.info(`${validatorAddress} is not a current validator`)
  }

  await resetFutureMessages(keygenQueue)
  await resetFutureMessages(cancelKeygenQueue)
  await resetFutureMessages(exchangeQueue)
  await resetFutureMessages(signQueue)
  await resetFutureMessages(epochTimeIntervalsQueue)
  logger.debug('Sending start commands')
  await axios.get('http://keygen:8001/start')
  await axios.get('http://signer:8001/start')
}

async function loop() {
  const latestBlockNumber = await provider.getBlockNumber()
  if (latestBlockNumber < blockNumber) {
    logger.debug(`No block after ${latestBlockNumber}`)
    await delay(2000)
    return
  }

  const endBlock = Math.min(latestBlockNumber, blockNumber + HOME_MAX_FETCH_RANGE_SIZE - 1)

  redisTx = redis.multi()

  logger.debug(`Watching events in blocks #${blockNumber}-${endBlock}`)

  const bridgeEvents = (await provider.getLogs({
    address: HOME_BRIDGE_ADDRESS,
    fromBlock: blockNumber,
    toBlock: endBlock,
    topics: []
  }))

  for (let curBlockNumber = blockNumber, i = 0; curBlockNumber <= endBlock; curBlockNumber += 1) {
    const rangeOffset = (curBlockNumber + 1 - epochStart) % rangeSize
    const rangeStart = curBlockNumber - (rangeOffset || rangeSize)
    let epochTimeUpdated = false
    while (i < bridgeEvents.length && bridgeEvents[i].blockNumber === curBlockNumber) {
      const event = bridge.interface.parseLog(bridgeEvents[i])
      logger.trace('Consumed event %o %o', event, bridgeEvents[i])
      switch (event.name) {
        case 'NewEpoch':
          if ((await bridge.getValidators(event.values.newEpoch)).includes(validatorAddress)) {
            await sendKeygen(event)
          }
          break
        case 'NewEpochCancelled':
          if ((await bridge.getValidators(event.values.epoch)).includes(validatorAddress)) {
            sendKeygenCancellation(event)
          }
          break
        case 'NewFundsTransfer':
          if (isCurrentValidator) {
            await sendSignFundsTransfer(event)
          }
          break
        case 'ExchangeRequest':
          if (isCurrentValidator) {
            await sendSign(event, bridgeEvents[i].transactionHash)
          }
          break
        case 'EpochStart':
          await processEpochStart(event)
          await redis.set('activeEpoch', true)
          activeEpoch = true
          epochTimeIntervalsQueue.send({
            blockNumber: curBlockNumber,
            startTime: await retry(() => getBlockTimestamp(curBlockNumber)) * 1000,
            epoch
          })
          epochTimeUpdated = true
          break
        case 'EpochEnd':
          logger.debug(`Consumed epoch ${epoch} end event`)
          await redis.set('activeEpoch', false)
          activeEpoch = false
          epochTimeIntervalsQueue.send({
            blockNumber: curBlockNumber,
            prolongedTime: await retry(() => getBlockTimestamp(curBlockNumber)) * 1000,
            epoch
          })
          break
        case 'EpochClose':
          if (isCurrentValidator) {
            await sendEpochClose()
          }
          break
        case 'ForceSign':
          if (isCurrentValidator && lastTransactionBlockNumber > rangeStart) {
            logger.debug('Consumed force sign event')
            lastTransactionBlockNumber = 0
            redisTx.set('lastTransactionBlockNumber', 0)
            await sendStartSign()
          }
          break
        default:
          logger.warn('Unknown event %o', event)
      }
      i += 1
    }

    if (curBlockNumber === endBlock && !epochTimeUpdated && epoch > 0 && activeEpoch) {
      epochTimeIntervalsQueue.send({
        blockNumber: curBlockNumber,
        prolongedTime: await retry(() => getBlockTimestamp(curBlockNumber)) * 1000,
        epoch
      })
    }

    if (rangeOffset === 0) {
      logger.info('Reached end of the current block range')

      if (isCurrentValidator && lastTransactionBlockNumber > curBlockNumber - rangeSize) {
        logger.info('Sending message to start signature generation for the ended range')
        await sendStartSign()
      }
    }
  }

  blockNumber = endBlock + 1
  // Exec redis tx
  await redisTx.set('homeBlock', endBlock).exec()
  await redis.save()
}

async function main() {
  await initialize()

  while (true) {
    await loop()
  }
}

main()
