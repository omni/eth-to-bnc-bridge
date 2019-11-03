const axios = require('axios')
const BN = require('bignumber.js')
const fs = require('fs')
const { computeAddress } = require('ethers').utils

const logger = require('./logger')
const redis = require('./db')
const { publicKeyToAddress } = require('./crypto')
const { delay, retry } = require('./wait')

const { FOREIGN_URL, PROXY_URL, FOREIGN_ASSET } = process.env

const FOREIGN_START_TIME = parseInt(process.env.FOREIGN_START_TIME, 10)
const FOREIGN_FETCH_INTERVAL = parseInt(process.env.FOREIGN_FETCH_INTERVAL, 10)
const FOREIGN_FETCH_BLOCK_TIME_OFFSET = parseInt(process.env.FOREIGN_FETCH_BLOCK_TIME_OFFSET, 10)

const foreignHttpClient = axios.create({ baseURL: FOREIGN_URL })
const proxyHttpClient = axios.create({ baseURL: PROXY_URL })

function getLastForeignAddress() {
  const epoch = Math.max(0, ...fs.readdirSync('/keys')
    .map((x) => parseInt(x.split('.')[0].substr(4), 10)))
  if (epoch === 0) {
    return null
  }
  const keysFile = `/keys/keys${epoch}.store`
  const publicKey = JSON.parse(fs.readFileSync(keysFile))[5]
  return publicKeyToAddress(publicKey)
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

async function fetchNewTransactions() {
  logger.debug('Fetching new transactions')
  const startTime = parseInt(await redis.get('foreignTime'), 10) + 1
  const address = getLastForeignAddress()
  const endTime = Math.min(startTime + 3 * 30 * 24 * 60 * 60 * 1000, await getBlockTime())
  if (address === null) {
    return {}
  }
  logger.debug('Sending api transactions request')
  const params = {
    address,
    side: 'RECEIVE',
    txAsset: FOREIGN_ASSET,
    txType: 'TRANSFER',
    startTime,
    endTime
  }

  logger.trace('%o', params)
  const transactions = (await retry(() => foreignHttpClient
    .get('/api/v1/transactions', { params }))).data.tx

  return {
    transactions,
    endTime
  }
}

async function initialize() {
  if (await redis.get('foreignTime') === null) {
    logger.info('Set default foreign time')
    await redis.set('foreignTime', FOREIGN_START_TIME)
  }
}

async function loop() {
  const { transactions, endTime } = await fetchNewTransactions()
  if (!transactions || transactions.length === 0) {
    logger.debug('Found 0 new transactions')
    await delay(FOREIGN_FETCH_INTERVAL)
    return
  }

  logger.info(`Found ${transactions.length} new transactions`)
  logger.trace('%o', transactions)

  for (let i = transactions.length - 1; i >= 0; i -= 1) {
    const tx = transactions[i]
    if (tx.memo !== 'funding') {
      const publicKeyEncoded = (await getTx(tx.txHash)).signatures[0].pub_key.value
      await proxyHttpClient
        .post('/transfer', {
          to: computeAddress(Buffer.from(publicKeyEncoded, 'base64')),
          value: new BN(tx.value)
            .multipliedBy(10 ** 18)
            .integerValue(),
          hash: `0x${tx.txHash}`
        })
    }
  }
  await redis.set('foreignTime', endTime)
}

async function main() {
  await initialize()

  while (true) {
    await loop()
  }
}

main()
