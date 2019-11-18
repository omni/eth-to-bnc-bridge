const axios = require('axios')
const BN = require('bignumber.js')
const fs = require('fs')
const { computeAddress } = require('ethers').utils

const logger = require('./logger')
const redis = require('./db')
const { publicKeyToAddress } = require('./crypto')
const { delay, retry } = require('./wait')
const { connectRabbit, assertQueue } = require('./amqp')

const {
  FOREIGN_URL, PROXY_URL, FOREIGN_ASSET, RABBITMQ_URL
} = process.env

const FOREIGN_FETCH_INTERVAL = parseInt(process.env.FOREIGN_FETCH_INTERVAL, 10)
const FOREIGN_FETCH_BLOCK_TIME_OFFSET = parseInt(process.env.FOREIGN_FETCH_BLOCK_TIME_OFFSET, 10)
const FOREIGN_FETCH_MAX_TIME_INTERVAL = parseInt(process.env.FOREIGN_FETCH_MAX_TIME_INTERVAL, 10)

const foreignHttpClient = axios.create({ baseURL: FOREIGN_URL })
const proxyHttpClient = axios.create({ baseURL: PROXY_URL })

let channel
let epochTimeIntervalsQueue

function getForeignAddress(epoch) {
  const keysFile = `/keys/keys${epoch}.store`
  try {
    const publicKey = JSON.parse(fs.readFileSync(keysFile))[5]
    return publicKeyToAddress(publicKey)
  } catch (e) {
    return null
  }
}

async function getTx(hash) {
  const response = await retry(() => foreignHttpClient.get(
    `/api/v1/tx/${hash}`,
    {
      params: {
        format: 'json'
      }
    }
  ))
  return response.data.tx.value
}

async function getBlockTime() {
  const response = await retry(() => foreignHttpClient.get('/api/v1/time'))
  return Date.parse(response.data.block_time) - FOREIGN_FETCH_BLOCK_TIME_OFFSET
}

async function fetchNewTransactions(address, startTime, endTime) {
  logger.debug('Fetching new transactions')
  const params = {
    address,
    side: 'RECEIVE',
    txAsset: FOREIGN_ASSET,
    txType: 'TRANSFER',
    startTime,
    endTime
  }

  logger.trace('Transactions fetch params %o', params)
  return (
    await retry(() => foreignHttpClient.get('/api/v1/transactions', { params }))
  ).data.tx
}

async function fetchTimeIntervalsQueue() {
  let epoch = null
  let startTime = null
  let endTime = null
  const lastBncBlockTime = await getBlockTime()
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

  const address = getForeignAddress(epoch)

  if (!address) {
    logger.debug('Validator is not included in current epoch')
    await redis.set(`foreignTime${epoch}`, endTime)
    await delay(FOREIGN_FETCH_INTERVAL)
    return
  }

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
        to: computeAddress(Buffer.from(publicKeyEncoded, 'base64')),
        value: new BN(tx.value).multipliedBy(10 ** 18).toString(16),
        hash: tx.txHash,
        epoch
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
