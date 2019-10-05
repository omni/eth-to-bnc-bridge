const express = require('express')
const Web3 = require('web3')
const AsyncLock = require('async-lock')
const crypto = require('crypto')
const bech32 = require('bech32')
const axios = require('axios')
const BN = require('bignumber.js')

const encode = require('./encode')
const decode = require('./decode')

const {
  HOME_RPC_URL, HOME_BRIDGE_ADDRESS, SIDE_RPC_URL, SIDE_SHARED_DB_ADDRESS, VALIDATOR_PRIVATE_KEY, HOME_CHAIN_ID,
  SIDE_CHAIN_ID, HOME_TOKEN_ADDRESS, FOREIGN_URL, FOREIGN_ASSET
} = process.env
const abiSharedDb = require('./contracts_data/SharedDB.json').abi
const abiBridge = require('./contracts_data/Bridge.json').abi
const abiToken = require('./contracts_data/IERC20.json').abi

const homeWeb3 = new Web3(HOME_RPC_URL, null, { transactionConfirmationBlocks: 1 })
const sideWeb3 = new Web3(SIDE_RPC_URL, null, { transactionConfirmationBlocks: 1 })
const bridge = new homeWeb3.eth.Contract(abiBridge, HOME_BRIDGE_ADDRESS)
const token = new homeWeb3.eth.Contract(abiToken, HOME_TOKEN_ADDRESS)
const sharedDb = new sideWeb3.eth.Contract(abiSharedDb, SIDE_SHARED_DB_ADDRESS)
const validatorAddress = homeWeb3.eth.accounts.privateKeyToAccount(`0x${VALIDATOR_PRIVATE_KEY}`).address

const httpClient = axios.create({ baseURL: FOREIGN_URL })

const lock = new AsyncLock()

let homeValidatorNonce
let sideValidatorNonce
let homeBlockGasLimit
let sideBlockGasLimit

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.post('/get', get)
app.post('/set', set)
app.post('/signupkeygen', signupKeygen)
app.post('/signupsign', signupSign)

app.post('/confirmKeygen', confirmKeygen)
app.post('/confirmFundsTransfer', confirmFundsTransfer)
app.post('/transfer', transfer)

const votesProxyApp = express()
votesProxyApp.use(express.json())
votesProxyApp.use(express.urlencoded({ extended: true }))

votesProxyApp.get('/vote/startVoting', voteStartVoting)
votesProxyApp.get('/vote/startKeygen', voteStartKeygen)
votesProxyApp.get('/vote/cancelKeygen', voteCancelKeygen)
votesProxyApp.get('/vote/addValidator/:validator', voteAddValidator)
votesProxyApp.get('/vote/removeValidator/:validator', voteRemoveValidator)
votesProxyApp.get('/vote/changeThreshold/:threshold', voteChangeThreshold)
votesProxyApp.get('/info', info)

async function main () {
  homeValidatorNonce = await homeWeb3.eth.getTransactionCount(validatorAddress)
  sideValidatorNonce = await sideWeb3.eth.getTransactionCount(validatorAddress)

  homeBlockGasLimit = (await homeWeb3.eth.getBlock("latest", false)).gasLimit
  sideBlockGasLimit = (await sideWeb3.eth.getBlock("latest", false)).gasLimit

  console.log(`My validator address in home and side networks is ${validatorAddress}`)

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
    from = (await bridge.methods.getNextValidators().call())[parseInt(req.body.key.first) - 1]
  else {
    const validators = await bridge.methods.getValidators().call()
    from = await sharedDb.methods.getSignupAddress(uuid, validators, parseInt(req.body.key.first)).call()
  }
  const to = Number(req.body.key.fourth) // 0 if empty
  const key = homeWeb3.utils.sha3(`${round}_${to}`)

  const data = await sharedDb.methods.getData(from, sideWeb3.utils.sha3(uuid), key).call()

  if (data.length > 2) {
    console.log(data)
    const decoded = decode(uuid[0] === 'k', round, data)
    console.log(decoded)
    res.send(Ok({ key: req.body.key, value: decoded }))
  }
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

  console.log(req.body.value)
  const encoded = encode(uuid[0] === 'k', round, req.body.value)
  console.log(encoded.toString('hex'))

  const query = sharedDb.methods.setData(sideWeb3.utils.sha3(uuid), key, encoded)
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
  const receipt = await sideSendQuery(query)

  // Already have signup
  if (receipt === false) {
    console.log('Already have signup')
    res.send(Ok({ uuid: hash, number: 0 }))
    return
  }

  const validators = await bridge.methods.getValidators().call()
  const id = (await sharedDb.methods.getSignupNumber(hash, validators, validatorAddress).call()).toNumber()

  res.send(Ok({ uuid: hash, number: id }))
  console.log('SignupSign end')
}

async function confirmKeygen (req, res) {
  console.log('Confirm keygen call')
  const { x, y } = req.body[5]
  const query = bridge.methods.confirmKeygen(`0x${x}`, `0x${y}`)
  await homeSendQuery(query)
  res.send()
  console.log('Confirm keygen end')
}

async function confirmFundsTransfer (req, res) {
  console.log('Confirm funds transfer call')
  const query = bridge.methods.confirmFundsTransfer()
  await homeSendQuery(query)
  res.send()
  console.log('Confirm funds transfer end')
}

function sideSendQuery (query) {
  return lock.acquire('side', async () => {
    console.log('Sending query')
    const encodedABI = query.encodeABI()
    const tx = {
      data: encodedABI,
      from: validatorAddress,
      to: SIDE_SHARED_DB_ADDRESS,
      nonce: sideValidatorNonce++,
      chainId: await sideWeb3.eth.net.getId()
    }
    tx.gas = Math.min(Math.ceil(await query.estimateGas({
      from: validatorAddress
    }) * 1.5), sideBlockGasLimit)
    const signedTx = await sideWeb3.eth.accounts.signTransaction(tx, VALIDATOR_PRIVATE_KEY)

    return sideWeb3.eth.sendSignedTransaction(signedTx.rawTransaction)
      .catch(e => {
        const error = parseError(e.message)
        const reason = parseReason(e.message)
        if (error === 'revert' && reason.length) {
          console.log(reason)
          return false
        } else if (error === 'out of gas') {
          console.log('Out of gas, retrying')
          return true
        } else {
          console.log('Side tx failed, retrying', e.message)
          return true
        }
      })
  })
    .then(result => {
      if (result === true)
        return sideSendQuery(query)
      return result
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
      chainId: await homeWeb3.eth.net.getId()
    }
    tx.gas = Math.min(Math.ceil(await query.estimateGas({
      from: validatorAddress
    }) * 1.5), homeBlockGasLimit)
    const signedTx = await homeWeb3.eth.accounts.signTransaction(tx, VALIDATOR_PRIVATE_KEY)

    return homeWeb3.eth.sendSignedTransaction(signedTx.rawTransaction)
      .catch(e => {
        const error = parseError(e.message)
        const reason = parseReason(e.message)
        if (error === 'revert' && reason.length) {
          console.log(reason)
          return false
        } else if (error === 'out of gas') {
          console.log('Out of gas, retrying')
          return true
        } else {
          console.log('Home tx failed, retrying', e.message)
          return true
        }
      })
  })
    .then(result => {
      if (result === true)
        return homeSendQuery(query)
      return result
    })
}

function parseReason (message) {
  const result = /(?<="reason":").*?(?=")/.exec(message)
  return result ? result[0] : ''
}

function parseError (message) {
  const result = /(?<="error":").*?(?=")/.exec(message)
  return result ? result[0] : ''
}

async function voteStartVoting (req, res) {
  console.log('Voting for starting new epoch voting process')
  const query = bridge.methods.startVoting()
  try {
    await homeSendQuery(query)
  } catch (e) {
    console.log(e)
  }
  res.send('Voted')
  console.log('Voted successfully')
}

async function voteStartKeygen (req, res) {
  console.log('Voting for starting new epoch keygen')
  const query = bridge.methods.voteStartKeygen()
  try {
    await homeSendQuery(query)
  } catch (e) {
    console.log(e)
  }
  res.send('Voted')
  console.log('Voted successfully')
}

async function voteCancelKeygen (req, res) {
  console.log('Voting for cancelling new epoch keygen')
  const query = bridge.methods.voteCancelKeygen()
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

async function voteChangeThreshold (req, res) {
  console.log('Voting for changing threshold')
  const query = bridge.methods.voteChangeThreshold(req.params.threshold)
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

function decodeStatus(status) {
  switch (status) {
    case 0: return 'ready'
    case 1: return 'voting'
    case 2: return 'keygen'
    case 3: return 'funds_transfer'
  }
}

async function info (req, res) {
  console.log('Info start')
  const [ x, y, epoch, nextEpoch, threshold, nextThreshold, validators, nextValidators, homeBalance, status ] = await Promise.all([
    bridge.methods.getX().call().then(x => new BN(x).toString(16)),
    bridge.methods.getY().call().then(x => new BN(x).toString(16)),
    bridge.methods.epoch().call().then(x => x.toNumber()),
    bridge.methods.nextEpoch().call().then(x => x.toNumber()),
    bridge.methods.getThreshold().call().then(x => x.toNumber()),
    bridge.methods.getNextThreshold().call().then(x => x.toNumber()),
    bridge.methods.getValidators().call(),
    bridge.methods.getNextValidators().call(),
    token.methods.balanceOf(HOME_BRIDGE_ADDRESS).call().then(x => parseFloat(new BN(x).dividedBy(10 ** 18).toFixed(8, 3))),
    bridge.methods.status().call().then(x => x.toNumber()),
  ])
  const foreignAddress = publicKeyToAddress({ x, y })
  const balances = await getForeignBalances(foreignAddress)
  res.send({
    epoch,
    nextEpoch,
    threshold,
    nextThreshold,
    homeBridgeAddress: HOME_BRIDGE_ADDRESS,
    foreignBridgeAddress: foreignAddress,
    validators,
    nextValidators,
    homeBalance,
    foreignBalanceTokens: parseFloat(balances[FOREIGN_ASSET]) || 0,
    foreignBalanceNative: parseFloat(balances['BNB']) || 0,
    bridgeStatus: decodeStatus(status)
  })
  console.log('Info end')
}

async function transfer (req, res) {
  console.log('Transfer start')
  const { hash, to, value } = req.body
  if (homeWeb3.utils.isAddress(to)) {
    console.log(`Calling transfer to ${to}, ${value} tokens`)
    const query = bridge.methods.transfer(hash, to, '0x' + (new BN(value).toString(16)))
    await homeSendQuery(query)
  } else {
    // return funds ?
  }
  res.send()
  console.log('Transfer end')
}

function getForeignBalances (address) {
  return httpClient
    .get(`/api/v1/account/${address}`)
    .then(res => res.data.balances.reduce((prev, cur) => {
      prev[cur.symbol] = cur.free
      return prev
    }, {}))
    .catch(err => ({}))
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


