const express = require('express')
const Web3 = require('web3')
const AsyncLock = require('async-lock')
const crypto = require('crypto')
const bech32 = require('bech32')
const axios = require('axios')
const BN = require('bignumber.js')

const { HOME_RPC_URL, HOME_BRIDGE_ADDRESS, SIDE_RPC_URL, SIDE_SHARED_DB_ADDRESS, VALIDATOR_PRIVATE_KEY, HOME_CHAIN_ID, SIDE_CHAIN_ID, HOME_TOKEN_ADDRESS, FOREIGN_URL } = process.env
const abiSharedDb = require('./contracts_data/SharedDB.json').abi
const abiBridge = require('./contracts_data/Bridge.json').abi
const abiToken = require('./contracts_data/IERC20.json').abi

const homeWeb3 = new Web3(HOME_RPC_URL, null, { transactionConfirmationBlocks: 1 })
const sideWeb3 = new Web3(SIDE_RPC_URL, null, { transactionConfirmationBlocks: 1 })
const bridge = new homeWeb3.eth.Contract(abiBridge, HOME_BRIDGE_ADDRESS)
const token = new homeWeb3.eth.Contract(abiToken, HOME_TOKEN_ADDRESS)
const sharedDb = new sideWeb3.eth.Contract(abiSharedDb, SIDE_SHARED_DB_ADDRESS)
const validatorAddress = homeWeb3.eth.accounts.privateKeyToAccount(`0x${VALIDATOR_PRIVATE_KEY}`).address

const FOREIGN_ASSET = 'BNB'
const httpClient = axios.create({ baseURL: FOREIGN_URL })

const lock = new AsyncLock()

let homeValidatorNonce
let sideValidatorNonce

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.post('/get', get)
app.post('/set', set)
app.post('/signupkeygen', signupKeygen)
app.post('/signupsign', signupSign)

app.get('/current_params', currentParams)
app.get('/next_params', nextParams)
app.post('/confirm', confirm)
app.post('/transfer', transfer)

const votesProxyApp = express()
votesProxyApp.use(express.json())
votesProxyApp.use(express.urlencoded({ extended: true }))

votesProxyApp.get('/vote/startEpoch/:epoch', voteStartEpoch)
votesProxyApp.get('/vote/addValidator/:validator', voteAddValidator)
votesProxyApp.get('/vote/removeValidator/:validator', voteRemoveValidator)
votesProxyApp.get('/info', info)

async function main () {
  homeValidatorNonce = await homeWeb3.eth.getTransactionCount(validatorAddress)
  sideValidatorNonce = await sideWeb3.eth.getTransactionCount(validatorAddress)

  app.listen(8001, () => {
    console.log('Proxy is listening on port 8001')
  })

  votesProxyApp.listen(8002, () => {
    console.log('Votes proxy is listening on port 8001')
  })
}

main()

function Ok (data) {
  return { Ok: data }
}

function Err (data) {
  return { Err: data }
}

async function get (req, res) {
  console.log('Get call')
  console.log(req.body.key)
  const round = req.body.key.second
  const uuid = req.body.key.third
  let from
  if (uuid.startsWith('k'))
    from = await bridge.methods.savedNextValidators(parseInt(req.body.key.first) - 1).call()
  else {
    const validators = await bridge.methods.getValidatorsArray().call()
    from = await sharedDb.methods.getSignupAddress(uuid, validators, parseInt(req.body.key.first)).call()
  }
  const to = Number(req.body.key.fourth) // 0 if empty
  const key = homeWeb3.utils.sha3(`${round}_${to}`)

  const data = await sharedDb.methods.getData(from, sideWeb3.utils.sha3(uuid), key).call()

  const result = homeWeb3.utils.hexToUtf8(data)
  if (result.length)
    res.send(Ok({ key: req.body.key, value: result }))
  else {
    setTimeout(() => res.send(Err(null)), 1000)
  }

  console.log('Get end')
}

async function set (req, res) {
  console.log('Set call')
  const round = req.body.key.second
  const uuid = req.body.key.third
  const to = Number(req.body.key.fourth)
  const key = homeWeb3.utils.sha3(`${round}_${to}`)

  const query = sharedDb.methods.setData(sideWeb3.utils.sha3(uuid), key, sideWeb3.utils.utf8ToHex(req.body.value))
  await sideSendQuery(query)

  res.send(Ok(null))
  console.log('Set end')
}

async function signupKeygen (req, res) {
  console.log('SignupKeygen call')
  const epoch = (await bridge.methods.nextEpoch().call()).toNumber()
  const partyId = (await bridge.methods.getNextPartyId(validatorAddress).call()).toNumber()

  if (partyId === 0) {
    res.send(Err({ message: 'Not a validator' }))
  } else {
    res.send(Ok({ uuid: `k${epoch}`, number: partyId }))
    console.log('SignupKeygen end')
  }
}

async function signupSign (req, res) {
  console.log('SignupSign call')
  const hash = sideWeb3.utils.sha3(`0x${req.body.third}`)
  const query = sharedDb.methods.signupSign(hash)
  await sideSendQuery(query)

  const validators = await bridge.methods.getValidatorsArray().call()
  const threshold = await bridge.methods.threshold().call()
  const id = (await sharedDb.methods.getSignupNumber(hash, validators, validatorAddress).call()).toNumber()

  if (id > threshold + 1) {
    res.send(Err({}))
  }

  res.send(Ok({ uuid: hash, number: id }))
  console.log('SignupSign end')
}

async function confirm (req, res) {
  console.log('Confirm call')
  const { x, y } = req.body[5]
  const query = bridge.methods.confirm(`0x${x}`, `0x${y}`)
  await homeSendQuery(query)
  res.send()
  console.log('Confirm end')
}

async function currentParams (req, res) {
  console.log('Current params call')
  const parties = (await bridge.methods.parties().call()).toNumber().toString()
  const threshold = (await bridge.methods.threshold().call()).toNumber().toString()
  res.send({ parties, threshold })
  console.log('Current params end')
}

async function nextParams (req, res) {
  console.log('Next params call')
  const parties = (await bridge.methods.nextParties().call()).toNumber().toString()
  const threshold = (await bridge.methods.nextThreshold().call()).toNumber().toString()
  res.send({ parties, threshold })
  console.log('Next params end')
}

function sideSendQuery (query) {
  return lock.acquire('side', async () => {
    const encodedABI = query.encodeABI()
    const tx = {
      data: encodedABI,
      from: validatorAddress,
      to: SIDE_SHARED_DB_ADDRESS,
      nonce: sideValidatorNonce++,
      chainId: parseInt(SIDE_CHAIN_ID)
    }
    tx.gas = Math.min(Math.ceil(await query.estimateGas(tx) * 1.5), 6721975)
    const signedTx = await sideWeb3.eth.accounts.signTransaction(tx, VALIDATOR_PRIVATE_KEY)

    try {
      return await sideWeb3.eth.sendSignedTransaction(signedTx.rawTransaction)
    } catch (e) {
      //sideValidatorNonce--
      console.log('Side tx failed', e.message)
      if (e.message.includes('out of gas')) {
        console.log('Out of gas, retrying')
        sideSendQuery(query)
      }
      return null
    }
  })
}

function homeSendQuery (query) {
  return lock.acquire('home', async () => {
    const encodedABI = query.encodeABI()
    const tx = {
      data: encodedABI,
      from: validatorAddress,
      to: HOME_BRIDGE_ADDRESS,
      nonce: homeValidatorNonce++,
      chainId: parseInt(HOME_CHAIN_ID)
    }
    tx.gas = Math.min(Math.ceil(await query.estimateGas(tx) * 1.5), 6721975)
    const signedTx = await homeWeb3.eth.accounts.signTransaction(tx, VALIDATOR_PRIVATE_KEY)

    try {
      return await homeWeb3.eth.sendSignedTransaction(signedTx.rawTransaction)
    } catch (e) {
      //homeValidatorNonce--
      console.log('Home tx failed', e.message)
      if (e.message.includes('out of gas')) {
        console.log('Out of gas, retrying')
        homeSendQuery(query)
      }
      return null
    }
  })
}

async function voteStartEpoch (req, res) {
  console.log('Voting for starting new epoch')
  const query = bridge.methods.voteStartEpoch(req.params.epoch)
  try {
    await homeSendQuery(query)
  } catch (e) {
    console.log(e)
  }
  res.send('Voted')
  console.log('Voted successfully')
}

async function voteAddValidator (req, res) {
  console.log('Voting for adding new validator')
  const query = bridge.methods.voteAddValidator(req.params.validator)
  try {
    await homeSendQuery(query)
  } catch (e) {
    console.log(e)
  }
  res.send('Voted')
  console.log('Voted successfully')
}

async function voteRemoveValidator (req, res) {
  console.log('Voting for removing validator')
  const query = bridge.methods.voteRemoveValidator(req.params.validator)
  try {
    await homeSendQuery(query)
  } catch (e) {
    console.log(e)
  }
  res.send('Voted')
  console.log('Voted successfully')
}

async function info (req, res) {
  console.log('Info start')
  const x = new BN(await bridge.methods.x().call()).toString(16)
  const y = new BN(await bridge.methods.y().call()).toString(16)
  res.send({
    epoch: (await bridge.methods.epoch().call()).toNumber(),
    nextEpoch: (await bridge.methods.nextEpoch().call()).toNumber(),
    threshold: (await bridge.methods.threshold().call()).toNumber(),
    nextThreshold: (await bridge.methods.nextThreshold().call()).toNumber(),
    homeBridgeAddress: HOME_BRIDGE_ADDRESS,
    foreignBridgeAddress: publicKeyToAddress({ x, y }),
    validators: await bridge.methods.getValidatorsArray().call(),
    nextValidators: await bridge.methods.getNextValidatorsArray().call(),
    homeBalance: (await token.methods.balanceOf(HOME_BRIDGE_ADDRESS).call()).toNumber(),
    foreignBalance: await getForeignBalance(publicKeyToAddress({ x, y })),
    bridgeStatus: await bridge.methods.ready().call()
  })
  console.log('Info end')
}

async function transfer (req, res) {
  console.log('Transfer start')
  const { hash, to, value } = req.body
  if (homeWeb3.utils.isAddress(to)) {
    console.log('Calling transfer')
    const query = bridge.methods.transfer(hash, to, value)
    await homeSendQuery(query)
  } else {
    // return funds ?
  }
  res.send()
  console.log('Transfer end')
}

function getForeignBalance(address) {
  return httpClient
    .get(`/api/v1/account/${address}`)
    .then(res => parseFloat(res.data.balances.find(x => x.symbol === FOREIGN_ASSET).free))
    .catch(err => 0)
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


