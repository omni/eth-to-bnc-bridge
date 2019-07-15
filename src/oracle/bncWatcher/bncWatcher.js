const redis = require('./db')
const axios = require('axios')
const bech32 = require('bech32')
const BN = require('bignumber.js')
const fs = require('fs')
const crypto = require('crypto')
const { computeAddress } = require('ethers').utils

const { FOREIGN_URL, PROXY_URL, FOREIGN_ASSET } = process.env

const foreignHttpClient = axios.create({ baseURL: FOREIGN_URL })
const proxyHttpClient = axios.create({ baseURL: PROXY_URL })

async function initialize () {
  if (await redis.get('foreignTime') === null) {
    console.log('Set default foreign time')
    await redis.set('foreignTime', 1562306990672)
  }
}

async function main () {
  const newTransactions = await fetchNewTransactions()
  if (newTransactions === null || newTransactions.length === 0) {

    await new Promise(r => setTimeout(r, 5000))
    return
  }

  console.log(`Found ${newTransactions.length} new transactions`)

  for (const tx of newTransactions.reverse()) {
    if (tx.memo !== 'funding') {
      const publicKeyEncoded = (await getTx(tx.txHash)).signatures[0].pub_key.value
      await proxyHttpClient
        .post('/transfer', {
          to: computeAddress(Buffer.from(publicKeyEncoded, 'base64')),
          value: new BN(tx.value).integerValue(BN.ROUND_FLOOR),//(new BN(tx.value).multipliedBy(10 ** 8)).toNumber(),
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
  console.log('Fetching new transactions')
  const startTime = parseInt(await redis.get('foreignTime')) + 1
  const address = await getLastForeignAddress()
  if (address === null)
    return null
  console.log('Sending api transactions request')
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

function publicKeyToAddress ({ x, y }) {
  const compact = (parseInt(y[y.length - 1], 16) % 2 ? '03' : '02') + padZeros(x, 64)
  const sha256Hash = crypto.createHash('sha256').update(Buffer.from(compact, 'hex')).digest('hex')
  const hash = crypto.createHash('ripemd160').update(Buffer.from(sha256Hash, 'hex')).digest('hex')
  const words = bech32.toWords(Buffer.from(hash, 'hex'))
  return bech32.encode('tbnb', words)
}

function padZeros (s, len) {
  while (s.length < len)
    s = '0' + s
  return s
}

initialize().then(async () => {
  while (true) {
    await main()
  }
})
