const axios = require('axios')
const BN = require('bignumber.js')
const ethers = require('ethers')

const logger = require('../shared/logger')
const redis = require('../shared/db')
const createProvider = require('../shared/ethProvider')
const { hexAddressToBncAddress } = require('../shared/crypto')
const { delay } = require('../shared/wait')
const { connectRabbit, assertQueue } = require('../shared/amqp')
const { getTx, getBlockTime, fetchNewTransactions } = require('../shared/binanceClient')

const {
  PROXY_URL, RABBITMQ_URL, HOME_RPC_URL, HOME_BRIDGE_ADDRESS
} = process.env

const FOREIGN_FETCH_INTERVAL = parseInt(process.env.FOREIGN_FETCH_INTERVAL, 10)
const FOREIGN_FETCH_BLOCK_TIME_OFFSET = parseInt(process.env.FOREIGN_FETCH_BLOCK_TIME_OFFSET, 10)
const FOREIGN_FETCH_MAX_TIME_INTERVAL = parseInt(process.env.FOREIGN_FETCH_MAX_TIME_INTERVAL, 10)

const proxyHttpClient = axios.create({ baseURL: PROXY_URL })

const bridgeAbi = [
  'function getForeignAddress(uint16 epoch) view returns (bytes20)'
]

const homeProvider = createProvider(HOME_RPC_URL)
const bridge = new ethers.Contract(HOME_BRIDGE_ADDRESS, bridgeAbi, homeProvider)

let channel
let epochTimeIntervalsQueue

async function getForeignAddress(epoch) {
  const foreignHexAddress = await bridge.getForeignAddress(epoch)
  return hexAddressToBncAddress(foreignHexAddress)
}

async function fetchTimeIntervalsQueue() {
  let epoch = null
  let startTime = null
  let endTime = null
  const lastBncBlockTime = await getBlockTime() - FOREIGN_FETCH_BLOCK_TIME_OFFSET
  logger.trace(`Binance last block timestamp ${lastBncBlockTime}`)
  while (true) {
    const msg = await epochTimeIntervalsQueue.get()
    if (msg === false) {
      break
    }
    const data = JSON.parse(msg.content)
    let accept = false
    logger.trace('Consumed time interval event %o', data)
    if (epoch !== null && epoch !== data.epoch) {
      logger.warn('Two consequently events have different epochs, should not be like this')
      channel.nack(msg, false, true)
      break
    }
    if (data.startTime) {
      logger.trace('Set foreign time', data)
      await redis.set(`foreignTime${data.epoch}`, data.startTime)
      channel.ack(msg)
      break
    }
    if (epoch === null) {
      accept = true
      epoch = data.epoch
      startTime = await redis.get(`foreignTime${epoch}`)
      logger.trace(`Retrieved epoch ${epoch} and start time ${startTime} from redis`)
      if (startTime === null) {
        logger.warn(`Empty foreign time for epoch ${epoch}`)
      }
    }
    if ((data.prolongedTime - startTime < FOREIGN_FETCH_MAX_TIME_INTERVAL || accept)
      && data.prolongedTime < lastBncBlockTime) {
      endTime = data.prolongedTime
      channel.ack(msg)
    } else {
      logger.trace('Requeuing current queue message')
      channel.nack(msg, false, true)
      break
    }
  }
  return {
    epoch,
    startTime,
    endTime
  }
}

async function initialize() {
  channel = await connectRabbit(RABBITMQ_URL)
  logger.info('Connecting to epoch time intervals queue')
  epochTimeIntervalsQueue = await assertQueue(channel, 'epochTimeIntervalsQueue')
}

async function loop() {
  const { epoch, startTime, endTime } = await fetchTimeIntervalsQueue()

  if (!startTime || !endTime) {
    logger.debug('Nothing to fetch')
    await delay(FOREIGN_FETCH_INTERVAL)
    return
  }

  const address = await getForeignAddress(epoch)
  const transactions = await fetchNewTransactions(address, startTime, endTime)

  if (transactions.length === 0) {
    logger.debug('Found 0 new transactions')
    await redis.set(`foreignTime${epoch}`, endTime)
    await delay(FOREIGN_FETCH_INTERVAL)
    return
  }

  logger.info(`Found ${transactions.length} new transactions`)
  logger.trace('%o', transactions)

  for (let i = transactions.length - 1; i >= 0; i -= 1) {
    const tx = transactions[i]
    if (tx.memo === '') {
      const publicKeyEncoded = (await getTx(tx.txHash)).signatures[0].pub_key.value
      await proxyHttpClient.post('/transfer', {
        to: ethers.utils.computeAddress(Buffer.from(publicKeyEncoded, 'base64')),
        value: new BN(tx.value).multipliedBy('1e18').toString(16),
        hash: tx.txHash
      })
    }
  }
  await redis.set(`foreignTime${epoch}`, endTime)
}

async function main() {
  await initialize()

  while (true) {
    await loop()
  }
}

main()
