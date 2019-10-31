const axios = require('axios')
const BN = require('bignumber.js')
const fs = require('fs')
const { computeAddress } = require('ethers').utils

const logger = require('./logger')
const redis = require('./db')
const { publicKeyToAddress } = require('./crypto')

const { FOREIGN_URL, PROXY_URL, FOREIGN_ASSET } = process.env

const foreignHttpClient = axios.create({ baseURL: FOREIGN_URL })
const proxyHttpClient = axios.create({ baseURL: PROXY_URL })

async function initialize () {
  if (await redis.get('foreignTime') === null) {
    logger.info('Set default foreign time')
    await redis.set('foreignTime', Date.now() - 2 * 30 * 24 * 60 * 60 * 1000)
  }
}

async function main () {
  const { transactions, endTime } = await fetchNewTransactions()
  if (!transactions || transactions.length === 0) {
    logger.debug(`Found 0 new transactions`)
    await new Promise(r => setTimeout(r, 5000))
    return
  }

  logger.info(`Found ${transactions.length} new transactions`)
  logger.trace('%o', transactions)

  for (const tx of transactions.reverse()) {
    if (tx.memo !== 'funding') {
      const publicKeyEncoded = (await getTx(tx.txHash)).signatures[0].pub_key.value
      await proxyHttpClient
        .post('/transfer', {
          to: computeAddress(Buffer.from(publicKeyEncoded, 'base64')),
          value: new BN(tx.value).multipliedBy(10 ** 18).integerValue(),
          hash: `0x${tx.txHash}`
        })
    }
    //await redis.set('foreignTime', Date.parse(tx.timeStamp))
  }
  await redis.set('foreignTime', endTime)
}

function getTx (hash) {
  return foreignHttpClient
    .get(`/api/v1/tx/${hash}`, {
      params: {
        format: 'json'
      }
    })
    .then(res => res.data.tx.value)
    .catch(() => getTx(hash))
}

function getBlockTime () {
  return foreignHttpClient
    .get(`/api/v1/time`)
    .then(res => Date.parse(res.data.block_time) - 10 * 1000)
    .catch(() => getBlockTime())
}

async function fetchNewTransactions () {
  logger.debug('Fetching new transactions')
  const startTime = parseInt(await redis.get('foreignTime')) + 1
  const address = getLastForeignAddress()
  const endTime = await getBlockTime()
  if (address === null)
    return {}
  logger.debug('Sending api transactions request')
  const params = {
    address,
    side: 'RECEIVE',
    txAsset: FOREIGN_ASSET,
    txType: 'TRANSFER',
    startTime,
    endTime,
  }
  try {
    logger.trace('%o', params)
    const transactions = (await foreignHttpClient
      .get('/api/v1/transactions', { params })).data.tx
    return { transactions, endTime }
  } catch (e) {
    return await fetchNewTransactions()
  }
}

function getLastForeignAddress () {
  const epoch = Math.max(0, ...fs.readdirSync('/keys').map(x => parseInt(x.split('.')[0].substr(4))))
  if (epoch === 0)
    return null
  const keysFile = `/keys/keys${epoch}.store`
  const publicKey = JSON.parse(fs.readFileSync(keysFile))[5]
  return publicKeyToAddress(publicKey)
}

initialize().then(async () => {
  while (true) {
    await main()
  }
})
