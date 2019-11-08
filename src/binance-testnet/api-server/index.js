const fs = require('fs')
const express = require('express')
const axios = require('axios')
const { execSync } = require('child_process')

const rpcClient = axios.create({
  baseURL: process.env.FOREIGN_RPC_URL,
  timeout: 10000
})

async function delay(ms) {
  await new Promise((res) => setTimeout(res, ms))
}

async function retry(getPromise, n = -1, sleep = 3000) {
  while (n) {
    try {
      return await getPromise()
    } catch (e) {
      console.debug(`Promise failed, retrying, ${n - 1} attempts left`)
      await delay(sleep)
      // eslint-disable-next-line no-param-reassign
      n -= 1
    }
  }
  return null
}

async function sendRpcRequest(subUrl, method, params) {
  console.trace(`Request to ${subUrl}, method ${method}, params `, params)
  const response = await retry(() => rpcClient.post(subUrl, {
    jsonrpc: '2.0',
    method,
    params,
    id: 1
  }))
  console.trace('Response, ', response.data)
  return response.data
}

const app = express()

// GET
// /api/v1/tx/:hash
// /api/v1/time
// /api/v1/transactions
// ?address=a&side=RECEIVE&txAsset=FOREIGN_ASSET&txType=TRANSFER&startTime=111&endTime=222
// /api/v1/account/:account
// /api/v1/account/:account/sequence
// POST
// /api/v1/broadcast?sync=true

app.get('/api/v1/tx/:hash', async (req, res) => {
  try {
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
  } catch (e) {
    res.status(404).end()
  }
})

app.listen(8000, () => {
  console.log('Listening on port 8000')
})
