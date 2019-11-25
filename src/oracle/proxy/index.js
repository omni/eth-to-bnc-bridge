const express = require('express')
const AsyncLock = require('async-lock')
const axios = require('axios')
const BN = require('bignumber.js')
const ethers = require('ethers')

const { tokenAbi, bridgeAbi, sharedDbAbi } = require('./contractsAbi')
const {
  Ok, Err, decodeStatus
} = require('./utils')
const encode = require('./encode')
const decode = require('./decode')
const { createSender, waitForReceipt } = require('./sendTx')
const logger = require('./logger')
const { publicKeyToAddress, padZeros } = require('./crypto')

const {
  HOME_RPC_URL, HOME_BRIDGE_ADDRESS, SIDE_RPC_URL, SIDE_SHARED_DB_ADDRESS, VALIDATOR_PRIVATE_KEY,
  HOME_TOKEN_ADDRESS, FOREIGN_URL, FOREIGN_ASSET
} = process.env

const Action = {
  CONFIRM_KEYGEN: 0,
  CONFIRM_FUNDS_TRANSFER: 1,
  CONFIRM_CLOSE_EPOCH: 2,
  VOTE_START_VOTING: 3,
  VOTE_ADD_VALIDATOR: 4,
  VOTE_REMOVE_VALIDATOR: 5,
  VOTE_CHANGE_THRESHOLD: 6,
  VOTE_CHANGE_RANGE_SIZE: 7,
  VOTE_CHANGE_CLOSE_EPOCH: 8,
  VOTE_START_KEYGEN: 9,
  VOTE_CANCEL_KEYGEN: 10,
  TRANSFER: 11
}

const homeProvider = new ethers.providers.JsonRpcProvider(HOME_RPC_URL)
const sideProvider = new ethers.providers.JsonRpcProvider(SIDE_RPC_URL)
const homeWallet = new ethers.Wallet(VALIDATOR_PRIVATE_KEY, homeProvider)
const sideWallet = new ethers.Wallet(VALIDATOR_PRIVATE_KEY, sideProvider)

const token = new ethers.Contract(HOME_TOKEN_ADDRESS, tokenAbi, homeWallet)
const bridge = new ethers.Contract(HOME_BRIDGE_ADDRESS, bridgeAbi, homeWallet)
const sharedDb = new ethers.Contract(SIDE_SHARED_DB_ADDRESS, sharedDbAbi, sideWallet)

const validatorAddress = homeWallet.address

const httpClient = axios.create({ baseURL: FOREIGN_URL })

const lock = new AsyncLock()

let sideValidatorNonce
let sideSender

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const votesProxyApp = express()

function sideSendQuery(query) {
  return lock.acquire('side', async () => {
    logger.debug('Sending side query')
    const senderResponse = await sideSender({
      data: query,
      to: SIDE_SHARED_DB_ADDRESS,
      nonce: sideValidatorNonce
    })
    if (senderResponse !== true) {
      sideValidatorNonce += 1
    }
    return senderResponse
  })
}

async function get(req, res) {
  logger.debug('Get call, %o', req.body.key)
  const round = req.body.key.second
  const uuid = req.body.key.third
  let from
  if (uuid.startsWith('k')) {
    from = (await bridge.getNextValidators())[parseInt(req.body.key.first, 10) - 1]
  } else {
    const validators = await bridge.getValidators()
    from = await sharedDb.getSignupAddress(
      uuid,
      validators,
      parseInt(req.body.key.first, 10)
    )
  }
  const to = Number(req.body.key.fourth) // 0 if empty
  const key = ethers.utils.id(`${round}_${to}`)

  const data = await sharedDb.getData(from, ethers.utils.id(uuid), key)

  if (data.length > 2) {
    logger.trace(`Received encoded data: ${data}`)
    const decoded = decode(uuid[0] === 'k', round, data)
    logger.trace('Decoded data: %o', decoded)
    res.send(Ok({
      key: req.body.key,
      value: decoded
    }))
  } else {
    setTimeout(() => res.send(Err(null)), 1000)
  }

  logger.debug('Get end')
}

async function set(req, res) {
  logger.debug('Set call')
  const round = req.body.key.second
  const uuid = req.body.key.third
  const to = Number(req.body.key.fourth)
  const key = ethers.utils.id(`${round}_${to}`)

  logger.trace('Received data: %o', req.body.value)
  const encoded = encode(uuid[0] === 'k', round, req.body.value)
  logger.trace(`Encoded data: ${encoded.toString('hex')}`)
  logger.trace(`Received data: ${req.body.value.length} bytes, encoded data: ${encoded.length} bytes`)
  const query = sharedDb.interface.functions.setData.encode([ethers.utils.id(uuid), key, encoded])
  await sideSendQuery(query)

  res.send(Ok(null))
  logger.debug('Set end')
}

async function signupKeygen(req, res) {
  logger.debug('SignupKeygen call')
  const epoch = await bridge.nextEpoch()
  const partyId = await bridge.getNextPartyId(validatorAddress)

  if (partyId === 0) {
    res.send(Err({ message: 'Not a validator' }))
    logger.debug('Not a validator')
  } else {
    res.send(Ok({
      uuid: `k${epoch}`,
      number: partyId
    }))
    logger.debug('SignupKeygen end')
  }
}

async function signupSign(req, res) {
  logger.debug('SignupSign call')
  const hash = ethers.utils.id(req.body.third)
  const query = sharedDb.interface.functions.signup.encode([hash])
  const { txHash } = await sideSendQuery(query)
  const receipt = await waitForReceipt(SIDE_RPC_URL, txHash)

  // Already have signup
  if (receipt.status === false) {
    res.send(Ok({
      uuid: hash,
      number: 0
    }))
    logger.debug('Already have signup')
    return
  }

  const validators = await bridge.getValidators()
  const id = await sharedDb.getSignupNumber(hash, validators, validatorAddress)

  res.send(Ok({
    uuid: hash,
    number: id
  }))
  logger.debug('SignupSign end')
}

function encodeParam(param) {
  switch (typeof param) {
    case 'string':
      if (param.startsWith('0x')) {
        return Buffer.from(param.slice(2), 'hex')
      }
      return Buffer.from(param, 'hex')
    case 'number':
      return Buffer.from(padZeros(param.toString(16), 4), 'hex')
    case 'boolean':
      return Buffer.from([param ? 1 : 0])
    default:
      return null
  }
}

function buildMessage(type, ...params) {
  logger.debug(`${type}, %o`, params)
  return Buffer.concat([
    Buffer.from([type]),
    ...params.map(encodeParam)
  ])
}

async function processMessage(message) {
  const signature = await sideWallet.signMessage(message)
  logger.debug('Adding signature to shared db contract')
  const query = sharedDb.interface.functions.addSignature.encode([`0x${message.toString('hex')}`, signature])
  await sideSendQuery(query)
}

async function confirmKeygen(req, res) {
  logger.debug('Confirm keygen call')
  const { x, y, epoch } = req.body
  const message = buildMessage(Action.CONFIRM_KEYGEN, epoch, padZeros(x, 64), padZeros(y, 64))
  await processMessage(message)
  res.send()
  logger.debug('Confirm keygen end')
}

async function confirmFundsTransfer(req, res) {
  logger.debug('Confirm funds transfer call')
  const { epoch } = req.body
  const message = buildMessage(Action.CONFIRM_FUNDS_TRANSFER, epoch)
  await processMessage(message)
  res.send()
  logger.debug('Confirm funds transfer end')
}

async function confirmCloseEpoch(req, res) {
  logger.debug('Confirm close epoch call')
  const { epoch } = req.body
  const message = buildMessage(Action.CONFIRM_CLOSE_EPOCH, epoch)
  await processMessage(message)
  res.send()
  logger.debug('Confirm close epoch end')
}

async function voteStartVoting(req, res) {
  logger.info('Voting for starting new epoch voting process')
  const epoch = await bridge.epoch()
  const message = buildMessage(Action.VOTE_START_VOTING, epoch)
  await processMessage(message)
  res.send('Voted\n')
  logger.info('Voted successfully')
}

async function voteStartKeygen(req, res) {
  logger.info('Voting for starting new epoch keygen')
  const epoch = await bridge.epoch()
  const message = buildMessage(Action.VOTE_START_KEYGEN, epoch)
  await processMessage(message)
  res.send('Voted\n')
  logger.info('Voted successfully')
}

async function voteCancelKeygen(req, res) {
  logger.info('Voting for cancelling new epoch keygen')
  const epoch = await bridge.nextEpoch()
  const message = buildMessage(Action.VOTE_CANCEL_KEYGEN, epoch)
  await processMessage(message)
  res.send('Voted\n')
  logger.info('Voted successfully')
}

async function voteAddValidator(req, res) {
  if (ethers.utils.isHexString(req.params.validator, 20)) {
    logger.info('Voting for adding new validator')
    const epoch = await bridge.epoch()
    const message = buildMessage(Action.VOTE_ADD_VALIDATOR, epoch, req.params.validator, padZeros('', 18))
    await processMessage(message)
    res.send('Voted\n')
    logger.info('Voted successfully')
  }
}

async function voteChangeThreshold(req, res) {
  if (/^[0-9]+$/.test(req.params.threshold)) {
    logger.info('Voting for changing threshold')
    const epoch = await bridge.epoch()
    const message = buildMessage(Action.VOTE_CHANGE_THRESHOLD, epoch, parseInt(req.params.threshold, 10), padZeros('', 54))
    await processMessage(message)
    res.send('Voted\n')
    logger.info('Voted successfully')
  }
}

async function voteChangeCloseEpoch(req, res) {
  if (req.params.closeEpoch === 'true' || req.params.closeEpoch === 'false') {
    logger.info('Voting for changing close epoch')
    const epoch = await bridge.epoch()
    const message = buildMessage(Action.VOTE_CHANGE_CLOSE_EPOCH, epoch, req.params.closeEpoch === 'true', padZeros('', 56))
    await processMessage(message)
    res.send('Voted\n')
    logger.info('Voted successfully')
  }
}

async function voteRemoveValidator(req, res) {
  if (ethers.utils.isHexString(req.params.validator, 20)) {
    logger.info('Voting for removing validator')
    const epoch = await bridge.epoch()
    const message = buildMessage(Action.VOTE_REMOVE_VALIDATOR, epoch, req.params.validator, padZeros('', 18))
    await processMessage(message)
    res.send('Voted\n')
    logger.info('Voted successfully')
  }
}

async function transfer(req, res) {
  logger.info('Transfer start')
  const {
    hash, to, value, epoch
  } = req.body
  if (ethers.utils.isHexString(to, 20)) {
    logger.info(`Calling transfer to ${to}, 0x${value} tokens`)
    const message = buildMessage(Action.TRANSFER, epoch, hash, to, padZeros(value, 24))
    logger.info(`Message for sign: ${message.toString('hex')}`)
    await processMessage(message)
  }
  res.send()
  logger.info('Transfer end')
}

function getForeignBalances(address) {
  return httpClient
    .get(`/api/v1/account/${address}`)
    .then((res) => res.data.balances.reduce((prev, cur) => {
      // eslint-disable-next-line no-param-reassign
      prev[cur.symbol] = cur.free
      return prev
    }, {}))
    .catch(() => ({}))
}

async function info(req, res) {
  logger.debug('Info start')
  try {
    const [
      x, y, epoch, rangeSize, nextRangeSize, closeEpoch, nextCloseEpoch, epochStartBlock,
      foreignNonce, nextEpoch, threshold, nextThreshold, validators, nextValidators, status,
      homeBalance
    ] = await Promise.all([
      bridge.getX().then((value) => new BN(value).toString(16)),
      bridge.getY().then((value) => new BN(value).toString(16)),
      bridge.epoch(),
      bridge.getRangeSize(),
      bridge.getNextRangeSize(),
      bridge.getCloseEpoch(),
      bridge.getNextCloseEpoch(),
      bridge.getStartBlock(),
      bridge.getNonce(),
      bridge.nextEpoch(),
      bridge.getThreshold(),
      bridge.getNextThreshold(),
      bridge.getValidators(),
      bridge.getNextValidators(),
      bridge.status(),
      token.balanceOf(HOME_BRIDGE_ADDRESS)
        .then((value) => parseFloat(new BN(value).dividedBy(10 ** 18).toFixed(8, 3)))
    ])
    const foreignAddress = publicKeyToAddress({
      x,
      y
    })
    const balances = await getForeignBalances(foreignAddress)
    const msg = {
      epoch,
      rangeSize,
      nextRangeSize,
      epochStartBlock,
      nextEpoch,
      threshold,
      nextThreshold,
      closeEpoch,
      nextCloseEpoch,
      homeBridgeAddress: HOME_BRIDGE_ADDRESS,
      foreignBridgeAddress: foreignAddress,
      foreignNonce,
      validators,
      nextValidators,
      homeBalance,
      foreignBalanceTokens: parseFloat(balances[FOREIGN_ASSET]) || 0,
      foreignBalanceNative: parseFloat(balances.BNB) || 0,
      bridgeStatus: decodeStatus(status)
    }
    logger.trace('%o', msg)
    res.send(msg)
  } catch (e) {
    logger.debug('%o', e)
    res.send({
      message: 'Something went wrong, resend request',
      error: e
    })
  }
  logger.debug('Info end')
}

app.post('/get', get)
app.post('/set', set)
app.post('/signupkeygen', signupKeygen)
app.post('/signupsign', signupSign)

app.post('/confirmKeygen', confirmKeygen)
app.post('/confirmFundsTransfer', confirmFundsTransfer)
app.post('/confirmCloseEpoch', confirmCloseEpoch)
app.post('/transfer', transfer)

votesProxyApp.get('/vote/startVoting', voteStartVoting)
votesProxyApp.get('/vote/startKeygen', voteStartKeygen)
votesProxyApp.get('/vote/cancelKeygen', voteCancelKeygen)
votesProxyApp.get('/vote/addValidator/:validator', voteAddValidator)
votesProxyApp.get('/vote/removeValidator/:validator', voteRemoveValidator)
votesProxyApp.get('/vote/changeThreshold/:threshold', voteChangeThreshold)
votesProxyApp.get('/vote/changeCloseEpoch/:closeEpoch', voteChangeCloseEpoch)
votesProxyApp.get('/info', info)

async function main() {
  sideValidatorNonce = await sideWallet.getTransactionCount()

  sideSender = await createSender(SIDE_RPC_URL, VALIDATOR_PRIVATE_KEY)

  logger.warn(`My validator address in home and side networks is ${validatorAddress}`)

  app.listen(8001, () => {
    logger.debug('Proxy is listening on port 8001')
  })

  votesProxyApp.listen(8002, () => {
    logger.debug('Votes proxy is listening on port 8002')
  })
}

main()
