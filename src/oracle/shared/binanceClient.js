const axios = require('axios')
const BN = require('bignumber.js')

const logger = require('./logger')
const { delay, retry } = require('./wait')

const { FOREIGN_URL, FOREIGN_ASSET } = process.env

const foreignHttpClient = axios.create({ baseURL: FOREIGN_URL })

async function getForeignBalances(address) {
  try {
    const response = await foreignHttpClient.get(`/api/v1/account/${address}`)
    return response.data.balances.reduce((prev, cur) => {
      // eslint-disable-next-line no-param-reassign
      prev[cur.symbol] = cur.free
      return prev
    }, {})
  } catch (e) {
    return {}
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
  return Date.parse(response.data.block_time)
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

async function getAccount(address) {
  logger.info(`Getting account ${address} data`)
  const response = await retry(() => foreignHttpClient.get(`/api/v1/account/${address}`))
  return response.data
}

async function getFee() {
  logger.info('Getting fees')
  const response = await retry(() => foreignHttpClient.get('/api/v1/fees'))
  const multiTransferFee = response.data.find((fee) => fee.multi_transfer_fee).multi_transfer_fee
  return new BN(multiTransferFee * 2).div(10 ** 8)
}

async function sendTx(tx) {
  while (true) {
    try {
      return await foreignHttpClient.post('/api/v1/broadcast?sync=true', tx, {
        headers: {
          'Content-Type': 'text/plain'
        }
      })
    } catch (err) {
      logger.trace('Error, response data %o', err.response.data)
      if (err.response.data.message.includes('Tx already exists in cache')) {
        logger.debug('Tx already exists in cache')
        return true
      }
      if (err.response.data.message.includes(' < ')) {
        logger.warn('Insufficient funds, waiting for funds')
        await delay(60000)
      } else {
        logger.info('Something failed, restarting: %o', err.response)
        await delay(10000)
      }
    }
  }
}

module.exports = {
  getForeignBalances,
  getTx,
  getBlockTime,
  fetchNewTransactions,
  getAccount,
  getFee,
  sendTx
}
