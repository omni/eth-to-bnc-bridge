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
  const newTransactions = await fetchNewTransactions()
  if (newTransactions === null || newTransactions.length === 0) {

    await new Promise(r => setTimeout(r, 5000))
    return
  }

  if (newTransactions.length)
    logger.info(`Found ${newTransactions.length} new transactions`)
  else
    logger.debug(`Found 0 new transactions`)

  for (const tx of newTransactions.reverse()) {
    if (tx.memo !== 'funding') {
      const publicKeyEncoded = (await getTx(tx.txHash)).signatures[0].pub_key.value
      await proxyHttpClient
        .post('/transfer', {
          to: computeAddress(Buffer.from(publicKeyEncoded, 'base64')),
          value: new BN(tx.value).multipliedBy(10 ** 18).integerValue(),
          hash: `0x${tx.txHash}`
        })
    }
    await redis.set('foreignTime', Date.parse(tx.timeStamp))
  }
}

function getTx(hash) {
  return foreignHttpClient
    .get(`/api/v1/tx/${hash}`, {
      params: {
        format: 'json'
      }
    })
    .then(res => res.data.tx.value)
    .catch(() => getTx(hash))
}

async function fetchNewTransactions () {
  logger.debug('Fetching new transactions')
  const startTime = parseInt(await redis.get('foreignTime')) + 1
  const address = getLastForeignAddress()
  if (address === null)
    return null
  logger.debug('Sending api transactions request')
  return foreignHttpClient
    .get('/api/v1/transactions', {
      params: {
        address,
        side: 'RECEIVE',
        txAsset: FOREIGN_ASSET,
        txType: 'TRANSFER',
        startTime,
        endTime: startTime + 3 * 30 * 24 * 60 * 60 * 1000,
      }
    })
    .then(res => res.data.tx)
    .catch(() => fetchNewTransactions())
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
