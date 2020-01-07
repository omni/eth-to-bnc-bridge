const ethers = require('ethers')
const BN = require('bignumber.js')
const axios = require('axios')

const logger = require('../shared/logger')
const redis = require('../shared/db')
const createProvider = require('../shared/ethProvider')
const { connectRabbit, assertQueue, resetFutureMessages } = require('../shared/amqp')
const { publicKeyToAddress, hexAddressToBncAddress } = require('../shared/crypto')
const { delay, retry } = require('../shared/wait')

const {
  HOME_RPC_URL, HOME_BRIDGE_ADDRESS, RABBITMQ_URL, HOME_START_BLOCK, VALIDATOR_PRIVATE_KEY,
  KEYGEN_CLIENT_URL, SIGN_CLIENT_URL, SIDE_SENDER_URL
} = process.env
const HOME_MAX_FETCH_RANGE_SIZE = parseInt(process.env.HOME_MAX_FETCH_RANGE_SIZE, 10)

const provider = createProvider(HOME_RPC_URL)
const bridgeAbi = [
  'event ExchangeRequest(uint96 value, uint32 nonce)',
  'event EpochEnd(uint16 indexed epoch)',
  'event NewEpoch(uint16 indexed oldEpoch, uint16 indexed newEpoch)',
  'event NewEpochCancelled(uint16 indexed epoch)',
  'event NewFundsTransfer(uint16 indexed oldEpoch, uint16 indexed newEpoch)',
  'event EpochStart(uint16 indexed epoch, bytes20 foreignAddress)',
  'event EpochClose(uint16 indexed epoch)',
  'event ForceSign()',
  'event RangeSizeChanged(uint16 rangeSize)',
  'function getForeignAddress(uint16 epoch) view returns (bytes20)',
  'function getThreshold(uint16 epoch) view returns (uint16)',
  'function getParties(uint16 epoch) view returns (uint16)',
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
let rangeSizeStartBlock
let lastTransactionBlockNumber
let isCurrentValidator
let activeEpoch

async function getBlockTimestamp(n) {
  return (await provider.getBlock(n, false)).timestamp
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
    foreignHexAddress, threshold, parties
  ] = await Promise.all([
    bridge.getForeignAddress(newEpoch),
    bridge.getThreshold(oldEpoch),
    bridge.getParties(oldEpoch)
  ])
  const recipient = hexAddressToBncAddress(foreignHexAddress)
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
    value: (new BN(event.values.value)).dividedBy('1e18').toFixed(8, 3),
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
  isCurrentValidator = (await bridge.getValidators(epoch)).includes(validatorAddress)
  if (isCurrentValidator) {
    logger.info(`${validatorAddress} is a current validator`)
  } else {
    logger.info(`${validatorAddress} is not a current validator`)
  }
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
  const rangeSizeLogs = await provider.getLogs({
    address: HOME_BRIDGE_ADDRESS,
    fromBlock: 1,
    toBlock: 'latest',
    topics: bridge.filters.RangeSizeChanged().topics
  })
  const lastRangeSizeEvent = rangeSizeLogs[rangeSizeLogs.length - 1]
  rangeSize = bridge.interface.parseLog(lastRangeSizeEvent).values.rangeSize
  rangeSizeStartBlock = lastRangeSizeEvent.blockNumber
  logger.debug(`Range size ${rangeSize} starting from block ${rangeSizeStartBlock}`)
  logger.debug('Checking if current validator')
  isCurrentValidator = (await bridge.getValidators(epoch)).includes(validatorAddress)
  if (isCurrentValidator) {
    logger.info(`${validatorAddress} is a current validator`)
  } else {
    logger.info(`${validatorAddress} is not a current validator`)
  }

  await resetFutureMessages(channel, keygenQueue, blockNumber)
  await resetFutureMessages(channel, cancelKeygenQueue, blockNumber)
  await resetFutureMessages(channel, exchangeQueue, blockNumber)
  await resetFutureMessages(channel, signQueue, blockNumber)
  await resetFutureMessages(channel, epochTimeIntervalsQueue, blockNumber)
  logger.debug('Sending start commands')
  await axios.get(`${KEYGEN_CLIENT_URL}/start`)
  await axios.get(`${SIGN_CLIENT_URL}/start`)
  await axios.get(`${SIDE_SENDER_URL}/start`)
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
    const rangeOffset = (curBlockNumber + 1 - rangeSizeStartBlock) % rangeSize
    const rangeStart = curBlockNumber - (rangeOffset || rangeSize)
    let epochTimeUpdated = false
    while (i < bridgeEvents.length && bridgeEvents[i].blockNumber === curBlockNumber) {
      const event = bridge.interface.parseLog(bridgeEvents[i])
      logger.trace('Consumed event %o %o', event, bridgeEvents[i])
      if (event) {
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
          case 'RangeSizeChanged':
            rangeSize = event.values.rangeSize
            rangeSizeStartBlock = curBlockNumber
            logger.debug(`Range size updated to ${rangeSize} at block ${rangeSizeStartBlock}`)
            break
          default:
            logger.warn('Unknown event %o', event)
        }
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
