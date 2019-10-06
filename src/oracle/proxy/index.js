const express = require('express')
const Web3 = require('web3')
const AsyncLock = require('async-lock')
const crypto = require('crypto')
const bech32 = require('bech32')
const axios = require('axios')
const BN = require('bignumber.js')
const { utils } = require('ethers')

const encode = require('./encode')
const decode = require('./decode')
const logger = require('./logger')

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

  homeBlockGasLimit = (await homeWeb3.eth.getBlock('latest', false)).gasLimit
  sideBlockGasLimit = (await sideWeb3.eth.getBlock('latest', false)).gasLimit

  logger.warn(`My validator address in home and side networks is ${validatorAddress}`)

  app.listen(8001, () => {
    logger.debug('Proxy is listening on port 8001')
  })

  votesProxyApp.listen(8002, () => {
    logger.debug('Votes proxy is listening on port 8001')
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
  logger.debug('Get call, %o', req.body.key)
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
    logger.trace(`Received encoded data: ${data}`)
    const decoded = decode(uuid[0] === 'k', round, data)
    logger.trace('Decoded data: %o', decoded)
    res.send(Ok({ key: req.body.key, value: decoded }))
  } else {
    setTimeout(() => res.send(Err(null)), 1000)
  }

  logger.debug('Get end')
}

async function set (req, res) {
  logger.debug('Set call')
  const round = req.body.key.second
  const uuid = req.body.key.third
  const to = Number(req.body.key.fourth)
  const key = homeWeb3.utils.sha3(`${round}_${to}`)

  logger.trace('Received data: %o', req.body.value)
  const encoded = encode(uuid[0] === 'k', round, req.body.value)
  logger.trace(`Encoded data: ${encoded.toString('hex')}`)
  logger.trace(`Received data: ${req.body.value.length} bytes, encoded data: ${encoded.length} bytes`)
  const query = sharedDb.methods.setData(sideWeb3.utils.sha3(uuid), key, encoded)
  await sideSendQuery(query)

  res.send(Ok(null))
  logger.debug('Set end')
}

async function signupKeygen (req, res) {
  logger.debug('SignupKeygen call')
  const epoch = (await bridge.methods.nextEpoch().call()).toNumber()
  const partyId = (await bridge.methods.getNextPartyId(validatorAddress).call()).toNumber()

  if (partyId === 0) {
    res.send(Err({ message: 'Not a validator' }))
    logger.debug('Not a validator')
  } else {
    res.send(Ok({ uuid: `k${epoch}`, number: partyId }))
    logger.debug('SignupKeygen end')
  }
}

async function signupSign (req, res) {
  logger.debug('SignupSign call')
  const hash = sideWeb3.utils.sha3(`0x${req.body.third}`)
  const query = sharedDb.methods.signupSign(hash)
  const receipt = await sideSendQuery(query)

  // Already have signup
  if (receipt === false) {
    res.send(Ok({ uuid: hash, number: 0 }))
    logger.debug('Already have signup')
    return
  }

  const validators = await bridge.methods.getValidators().call()
  const id = (await sharedDb.methods.getSignupNumber(hash, validators, validatorAddress).call()).toNumber()

  res.send(Ok({ uuid: hash, number: id }))
  logger.debug('SignupSign end')
}

async function confirmKeygen (req, res) {
  logger.debug('Confirm keygen call')
  const { x, y } = req.body[5]
  const query = bridge.methods.confirmKeygen(`0x${x}`, `0x${y}`)
  await homeSendQuery(query)
  res.send()
  logger.debug('Confirm keygen end')
}

async function confirmFundsTransfer (req, res) {
  logger.debug('Confirm funds transfer call')
  const query = bridge.methods.confirmFundsTransfer()
  await homeSendQuery(query)
  res.send()
  logger.debug('Confirm funds transfer end')
}

function sideSendQuery (query) {
  return lock.acquire('side', async () => {
    logger.debug('Sending query')
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
          logger.debug(reason)
          return false
        } else if (error === 'out of gas') {
          logger.debug('Out of gas, retrying')
          return true
        } else {
          logger.debug('Side tx failed, retrying, %o', e.message)
          return true
        }
      })
  })
    .then(result => {
      if (result === true)
        return sideSendQuery(query)
      return result !== false
    })
}

function homeSendQuery (query) {
  return lock.acquire('home', async () => {
    logger.debug('Sending query')
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
          logger.debug(reason)
          return false
        } else if (error === 'out of gas') {
          logger.debug('Out of gas, retrying')
          return true
        } else {
          logger.debug('Home tx failed, retrying, %o', e.message)
          return true
        }
      })
  })
    .then(result => {
      if (result === true)
        return homeSendQuery(query)
      return result !== false
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

async function sendVote(query, req, res) {
  try {
    if (await homeSendQuery(query)) {
      res.send('Voted\n')
      logger.info('Voted successfully')
    } else {
      res.send('Failed\n')
      logger.info('Failed to vote')
    }
  } catch (e) {
    logger.debug(e)
  }
}

async function voteStartVoting (req, res) {
  logger.info('Voting for starting new epoch voting process')
  const query = bridge.methods.startVoting()
  sendVote(query, req, res)
}

async function voteStartKeygen (req, res) {
  logger.info('Voting for starting new epoch keygen')
  const query = bridge.methods.voteStartKeygen()
  sendVote(query, req, res)
}

async function voteCancelKeygen (req, res) {
  logger.info('Voting for cancelling new epoch keygen')
  const query = bridge.methods.voteCancelKeygen()
  sendVote(query, req, res)
}

async function voteAddValidator (req, res) {
  logger.info('Voting for adding new validator')
  const query = bridge.methods.voteAddValidator(req.params.validator)
  sendVote(query, req, res)
}

async function voteChangeThreshold (req, res) {
  logger.info('Voting for changing threshold')
  const query = bridge.methods.voteChangeThreshold(req.params.threshold)
  sendVote(query, req, res)
}

async function voteRemoveValidator (req, res) {
  logger.info('Voting for removing validator')
  const query = bridge.methods.voteRemoveValidator(req.params.validator)
  sendVote(query, req, res)
}

function decodeStatus (status) {
  switch (status) {
    case 0:
      return 'ready'
    case 1:
      return 'voting'
    case 2:
      return 'keygen'
    case 3:
      return 'funds_transfer'
  }
}

async function info (req, res) {
  logger.debug('Info start')
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
    bridge.methods.status().call()
  ])
  const boundX = x => {
    try {
      return x.toNumber()
    } catch (e) {
      return -1
    }
  }
  const [ confirmationsForFundsTransfer, votesForVoting, votesForKeygen, votesForCancelKeygen ] = await Promise.all([
    bridge.methods.votesCount(homeWeb3.utils.sha3(utils.solidityPack([ 'uint8', 'uint256' ], [ 1, nextEpoch ]))).call().then(boundX),
    bridge.methods.votesCount(homeWeb3.utils.sha3(utils.solidityPack([ 'uint8', 'uint256' ], [ 2, nextEpoch ]))).call().then(boundX),
    bridge.methods.votesCount(homeWeb3.utils.sha3(utils.solidityPack([ 'uint8', 'uint256' ], [ 6, nextEpoch ]))).call().then(boundX),
    bridge.methods.votesCount(homeWeb3.utils.sha3(utils.solidityPack([ 'uint8', 'uint256' ], [ 7, nextEpoch ]))).call().then(boundX)
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
    bridgeStatus: decodeStatus(status),
    votesForVoting,
    votesForKeygen,
    votesForCancelKeygen,
    confirmationsForFundsTransfer
  })
  logger.debug('Info end')
}

async function transfer (req, res) {
  logger.info('Transfer start')
  const { hash, to, value } = req.body
  if (homeWeb3.utils.isAddress(to)) {
    logger.info(`Calling transfer to ${to}, ${value} tokens`)
    const query = bridge.methods.transfer(hash, to, '0x' + (new BN(value).toString(16)))
    await homeSendQuery(query)
  } else {
    // return funds ?
  }
  res.send()
  logger.info('Transfer end')
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


