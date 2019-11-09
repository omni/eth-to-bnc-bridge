const { execSync } = require('child_process')

const express = require('express')
const axios = require('axios')
const BN = require('bignumber.js')

const createParser = require('./parser')

const rpcClient = axios.create({
  baseURL: process.env.FOREIGN_RPC_URL,
  timeout: 10000
})

const apiClient = axios.create({
  baseURL: process.env.FOREIGN_API_SERVER_URL,
  timeout: 10000
})

const transfers = []

const parser = createParser('/http-api/marketdata/marketdata.json', 20 * 1024)
parser.eventEmitter.on('object', (obj) => {
  obj.Transfers.forEach((event) => {
    // eslint-disable-next-line no-param-reassign
    event.Timestamp = Math.ceil(obj.Timestamp / 1000)
    transfers.push(event)
  })
})

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

function wrap(f) {
  return async (req, res) => {
    try {
      await f(req, res)
    } catch (e) {
      res.status(404).end()
    }
  }
}

async function handleTx(req, res) {
  const {
    tx, hash, height, result
  } = JSON.parse(
    execSync(`./tbnbcli tx ${req.params.hash} --node "http://node:26657" --chain-id Binance-Dev`)
  )
  res.send({
    code: 0,
    hash,
    height,
    log: result.log,
    ok: true,
    tx
  })
}

async function handleTransactions(req, res) {
  // eslint-disable-next-line no-empty
  while (parser.update()) {}
  const {
    address, side, txAsset, txType, startTime, endTime
  } = req.query
  if (txType !== 'TRANSFER' || side !== 'RECEIVE') {
    res.status(400).send('Given parameters are not supported')
  }
  const filtered = transfers.filter((event) => event.Timestamp >= parseInt(startTime, 10)
    && event.Timestamp <= parseInt(endTime, 10)
    && event.To.length === 1
    && event.To[0].Addr === address
    && event.To[0].Coins.length === 1
    && event.To[0].Coins[0].denom === txAsset)
  res.send({
    tx: filtered.map((tx) => ({
      txHash: tx.TxHash,
      memo: tx.Memo,
      value: new BN(tx.To[0].Coins[0].amount).dividedBy(10 ** 8).toFixed(8, 3)
    })),
    total: filtered.length
  })
}

async function handleTime(req, res) {
  const response = (await rpcClient.get('/status')).data
  res.send({
    ap_time: response.result.sync_info.latest_block_time,
    block_time: response.result.sync_info.latest_block_time
  })
}

async function handleAccount(req, res) {
  const response = (await apiClient.get(`/api/v1/account/${req.params.account}`)).data
  res.send(response)
}

async function handleAccountSequence(req, res) {
  const response = (await apiClient.get(`/api/v1/account/${req.params.account}`)).data
  res.send(response.sequence.toString())
}

async function handleBroadcast(req, res) {
  if (req.query.sync !== 'true') {
    res.status(400).send('Async broadcast is not supported')
  } else {
    const response = (await rpcClient.get('/broadcast_tx_sync', {
      params: {
        tx: req.body
      }
    })).data
    res.send(response.result)
  }
}

app.get('/api/v1/tx/:hash', wrap(handleTx))
app.get('/api/v1/time', wrap(handleTime))
app.get('/api/v1/transactions', wrap(handleTransactions))
app.get('/api/v1/account/:account', wrap(handleAccount))
app.get('/api/v1/account/:account/sequence', wrap(handleAccountSequence))
app.post('/api/v1/broadcast', wrap(handleBroadcast))

app.listen(8000, () => {
  console.log('Listening on port 8000')
})
