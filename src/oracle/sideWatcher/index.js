const ethers = require('ethers')
const axios = require('axios')

const logger = require('../shared/logger')
const redis = require('../shared/db')
const createProvider = require('../shared/ethProvider')
const { connectRabbit, assertQueue, resetFutureMessages } = require('../shared/amqp')
const { delay, retry } = require('../shared/wait')

const {
  VALIDATOR_PRIVATE_KEY, HOME_RPC_URL, HOME_BRIDGE_ADDRESS, SIDE_RPC_URL, SIDE_SHARED_DB_ADDRESS,
  RABBITMQ_URL, SIDE_START_BLOCK
} = process.env
const SIDE_MAX_FETCH_RANGE_SIZE = parseInt(process.env.SIDE_MAX_FETCH_RANGE_SIZE, 10)

const bridgeAbi = [
  'function applyMessage(bytes message, bytes signatures)',
  'function getThreshold(uint16 epoch) view returns (uint16)',
  'function getValidators(uint16 epoch) view returns (address[])'
]
const sharedDbAbi = [
  'event NewSignature(address indexed signer, bytes32 msgHash)',
  'function signedMessages(bytes32 hash) view returns (bytes)',
  'function getSignatures(bytes32 msgHash, address[] validators) view returns (bytes)',
  'function isResponsibleToSend(bytes32 msgHash, address[] validators, uint16 threshold, address validatorAddress) view returns (bool)'
]

const sideProvider = createProvider(SIDE_RPC_URL)
const homeProvider = createProvider(HOME_RPC_URL)

const bridge = new ethers.Contract(HOME_BRIDGE_ADDRESS, bridgeAbi, homeProvider)
const sharedDb = new ethers.Contract(SIDE_SHARED_DB_ADDRESS, sharedDbAbi, sideProvider)

const validatorAddress = ethers.utils.computeAddress(`0x${VALIDATOR_PRIVATE_KEY}`)

let blockNumber
let homeSendQueue
let channel
let curBlockNumber

async function handleNewSignature(event) {
  const { msgHash } = event.values
  const message = await sharedDb.signedMessages(msgHash)
  const epoch = parseInt(message.slice(4, 8), 16)
  const [threshold, validators] = await Promise.all([
    bridge.getThreshold(epoch),
    bridge.getValidators(epoch)
  ])

  const isResponsibleToSend = await sharedDb.isResponsibleToSend(
    msgHash,
    validators,
    threshold,
    validatorAddress
  )

  if (isResponsibleToSend) {
    logger.info(`This validator is responsible to send message ${message}`)
    const signatures = await retry(
      () => sharedDb.getSignatures(msgHash, validators),
      -1,
      (curSignatures) => (curSignatures.length - 2) / 130 >= threshold
    )

    const requiredSignatures = signatures.slice(0, 2 + 130 * threshold)

    const data = await bridge.interface.functions.applyMessage.encode([message, requiredSignatures])

    homeSendQueue.send({
      data,
      blockNumber: curBlockNumber
    })
  } else {
    logger.debug(`This validator is not responsible to send message ${message}`)
  }
}

async function loop() {
  const latestBlockNumber = await sideProvider.getBlockNumber()
  if (latestBlockNumber < blockNumber) {
    logger.debug(`No block after ${latestBlockNumber}`)
    await delay(2000)
    return
  }

  const endBlock = Math.min(latestBlockNumber, blockNumber + SIDE_MAX_FETCH_RANGE_SIZE - 1)

  const redisTx = redis.multi()

  logger.debug(`Watching events in blocks #${blockNumber}-${endBlock}`)

  const bridgeEvents = await sideProvider.getLogs({
    address: SIDE_SHARED_DB_ADDRESS,
    fromBlock: blockNumber,
    toBlock: endBlock,
    topics: sharedDb.interface.events.NewSignature.encodeTopics([validatorAddress])
  })

  for (let i = 0; i < bridgeEvents.length; i += 1) {
    curBlockNumber = bridgeEvents[i].blockNumber
    const event = sharedDb.interface.parseLog(bridgeEvents[i])
    logger.trace('Consumed event %o %o', event, bridgeEvents[i])
    await handleNewSignature(event)
  }

  blockNumber = endBlock + 1
  // Exec redis tx
  await redisTx.set('sideBlock', endBlock).exec()
  await redis.save()
}

async function initialize() {
  channel = await connectRabbit(RABBITMQ_URL)
  homeSendQueue = await assertQueue(channel, 'homeSendQueue')

  blockNumber = (parseInt(await redis.get('sideBlock'), 10) + 1) || parseInt(SIDE_START_BLOCK, 10)

  await resetFutureMessages(channel, homeSendQueue, blockNumber)
  logger.debug('Sending start commands')
  await axios.get('http://local_home-sender:8001/start')
}

async function main() {
  await initialize()

  while (true) {
    await loop()
  }
}

main()
