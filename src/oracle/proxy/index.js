const express = require('express')
const BN = require('bignumber.js')
const ethers = require('ethers')

const { tokenAbi, bridgeAbi, sharedDbAbi } = require('./contractsAbi')
const {
  Ok, Err, decodeState, encodeParam, Action
} = require('./utils')
const encode = require('./encode')
const decode = require('./decode')
const logger = require('../shared/logger')
const { retry, delay } = require('../shared/wait')
const createProvider = require('../shared/ethProvider')
const { connectRabbit, assertQueue } = require('../shared/amqp')
const { hexAddressToBncAddress, padZeros, publicKeyToHexAddress } = require('../shared/crypto')
const {
  parseNumber, parseAddress, parseBool, parseTokens, logRequest
} = require('./expressUtils')
const { getForeignBalances } = require('../shared/binanceClient')

const {
  HOME_RPC_URL, HOME_BRIDGE_ADDRESS, SIDE_RPC_URL, SIDE_SHARED_DB_ADDRESS, VALIDATOR_PRIVATE_KEY,
  HOME_TOKEN_ADDRESS, FOREIGN_ASSET, RABBITMQ_URL
} = process.env

const sideProvider = createProvider(SIDE_RPC_URL)
const homeProvider = createProvider(HOME_RPC_URL)
const sideWallet = new ethers.Wallet(VALIDATOR_PRIVATE_KEY, sideProvider)

const token = new ethers.Contract(HOME_TOKEN_ADDRESS, tokenAbi, homeProvider)
const bridge = new ethers.Contract(HOME_BRIDGE_ADDRESS, bridgeAbi, homeProvider)
const sharedDb = new ethers.Contract(SIDE_SHARED_DB_ADDRESS, sharedDbAbi, sideProvider)

const validatorAddress = sideWallet.address

let channel
let sideSendQueue

const app = express()
app.use(express.json({ strict: false }))
app.use(express.urlencoded({ extended: true }))

const votesProxyApp = express()

async function status(req, res) {
  const [bridgeEpoch, bridgeStatus] = await Promise.all([
    bridge.epoch(),
    bridge.state()
  ])
  res.send({
    bridgeEpoch,
    bridgeStatus
  })
}

async function get(req, res) {
  const tags = req.body.key.split('-')
  const fromId = parseInt(tags[0], 10)
  const round = tags[tags.length - 2]
  const uuid = tags[tags.length - 1]
  const hash = ethers.utils.id(uuid)
  const to = tags.length === 4 ? tags[1] : ''
  const [mode, epoch] = uuid.split('_')
  const validators = await bridge['getValidators(uint16)'](parseInt(epoch, 10))
  const from = mode === 'k' ? validators[fromId - 1] : await sharedDb.getSignupAddress(hash, validators, fromId)
  const key = ethers.utils.id(`${round}_${Number(to)}`)

  const data = await sharedDb.getData(from, hash, key)

  if (data.length > 2) {
    logger.trace(`Received encoded data: ${data}`)
    const decoded = decode(mode === 'k', round, data)
    logger.trace('Decoded data: %o', decoded)
    res.send(Ok({
      key: req.body.key,
      value: decoded
    }))
  } else {
    await delay(1000)
    res.send(Err(null))
  }
}

function sendJob(data) {
  sideSendQueue.send({
    data
  })
}

async function set(req, res) {
  const tags = req.body.key.split('-')
  const round = tags[tags.length - 2]
  const uuid = tags[tags.length - 1]
  const hash = ethers.utils.id(uuid)
  const to = tags.length === 4 ? tags[1] : ''
  const key = ethers.utils.id(`${round}_${Number(to)}`)

  logger.trace('Received data: %o', req.body.value)
  const encoded = encode(uuid[0] === 'k', round, req.body.value)
  logger.trace(`Encoded data: ${encoded.toString('hex')}`)
  logger.trace(`Received data: ${req.body.value.length} bytes, encoded data: ${encoded.length} bytes`)
  logger.debug(`${hash} ${key}`)
  const query = sharedDb.interface.functions.setData.encode([hash, key, encoded])
  sendJob(query)

  res.send(Ok(null))
}

async function signupKeygen(req, res) {
  const epoch = await bridge.nextEpoch()
  const partyId = await bridge.getNextPartyId(validatorAddress)

  logger.debug('Checking previous attempts')
  let attempt = 1
  let uuid
  while (true) {
    uuid = `k_${epoch}_${attempt}`
    const hash = ethers.utils.id(uuid)
    const data = await sharedDb.getData(validatorAddress, hash, ethers.utils.id('round1_0'))
    if (data.length === 2) {
      break
    }
    logger.trace(`Attempt ${attempt} is already used`)
    attempt += 1
  }
  logger.debug(`Using attempt ${attempt}`)

  if (partyId === 0) {
    res.send(Err({ message: 'Not a validator' }))
    logger.debug('Not a validator')
  } else {
    res.send(Ok({
      uuid,
      number: partyId
    }))
  }
}

async function signupSign(req, res) {
  const [, , msgHash] = req.body.split('-')

  logger.debug('Checking previous attempts')
  let attempt = 1
  let uuid
  let hash
  const epoch = await bridge.epoch()
  while (true) {
    uuid = `s_${epoch}_${msgHash}_${attempt}`
    hash = ethers.utils.id(uuid)
    const data = await sharedDb.isSignuped(hash, validatorAddress)
    if (!data) {
      break
    }
    logger.trace(`Attempt ${attempt} is already used`)
    attempt += 1
  }
  logger.debug(`Using attempt ${attempt}`)

  const query = sharedDb.interface.functions.signup.encode([hash])

  sendJob(query)
  const validators = await bridge.getValidators()
  const id = await retry(
    () => sharedDb.getSignupNumber(hash, validators, validatorAddress),
    -1,
    (signupId) => signupId > 0
  )

  res.send(Ok({
    uuid,
    number: id
  }))
}

async function processMessage(type, ...params) {
  logger.debug(`Building message ${type}, %o`, params)
  const message = Buffer.concat([
    Buffer.from([type]),
    ...params.map(encodeParam)
  ])

  const signature = await sideWallet.signMessage(message)
  logger.debug('Adding signature to shared db contract')
  const query = sharedDb.interface.functions.addSignature.encode([`0x${message.toString('hex')}`, signature])
  sendJob(query)
}

async function confirmKeygen(req, res) {
  const { x, y, epoch } = req.body
  const hexAddress = publicKeyToHexAddress({
    x,
    y
  })
  await processMessage(Action.CONFIRM_KEYGEN, epoch, hexAddress)
  res.send()
}

async function confirmFundsTransfer(req, res) {
  const { epoch } = req.body
  await processMessage(Action.CONFIRM_FUNDS_TRANSFER, epoch)
  res.send()
}

async function confirmCloseEpoch(req, res) {
  const { epoch } = req.body
  await processMessage(Action.CONFIRM_CLOSE_EPOCH, epoch)
  res.send()
}

async function voteStartVoting(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(Action.START_VOTING, epoch)
  res.send('Voted\n')
}

async function voteStartKeygen(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(
    Action.START_KEYGEN,
    epoch,
    padZeros(req.attempt.toString(16), 58)
  )
  res.send('Voted\n')
}

async function voteCancelKeygen(req, res) {
  const epoch = await bridge.nextEpoch()
  await processMessage(
    Action.CANCEL_KEYGEN,
    epoch,
    padZeros(req.attempt.toString(16), 58)
  )
  res.send('Voted\n')
}

async function voteAddValidator(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(
    Action.ADD_VALIDATOR,
    epoch,
    req.validator,
    padZeros(req.attempt.toString(16), 18)
  )
  res.send('Voted\n')
}

async function voteChangeThreshold(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(
    Action.CHANGE_THRESHOLD,
    epoch,
    req.threshold,
    padZeros(req.attempt.toString(16), 54)
  )
  res.send('Voted\n')
}

async function voteChangeRangeSize(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(
    Action.CHANGE_RANGE_SIZE,
    epoch,
    req.rangeSize,
    padZeros(req.attempt.toString(16), 54)
  )
  res.send('Voted\n')
}

async function voteChangeCloseEpoch(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(
    Action.CHANGE_CLOSE_EPOCH,
    epoch,
    req.closeEpoch,
    padZeros(req.attempt.toString(16), 56)
  )
  res.send('Voted\n')
}

async function voteRemoveValidator(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(
    Action.REMOVE_VALIDATOR,
    epoch,
    req.validator,
    padZeros(req.attempt.toString(16), 18)
  )
  res.send('Voted\n')
}

async function voteChangeMinPerTxLimit(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(
    Action.CHANGE_MIN_PER_TX_LIMIT,
    epoch,
    padZeros(req.limit, 24),
    padZeros(req.attempt.toString(16), 34)
  )
  res.send('Voted\n')
}

async function voteChangeMaxPerTxLimit(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(
    Action.CHANGE_MAX_PER_TX_LIMIT,
    epoch,
    padZeros(req.limit, 24),
    padZeros(req.attempt.toString(16), 34)
  )
  res.send('Voted\n')
}

async function voteDecreaseExecutionMinLimit(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(
    Action.DECREASE_EXECUTION_MIN_TX_LIMIT,
    epoch,
    padZeros(req.limit, 24),
    padZeros(req.attempt.toString(16), 34)
  )
  res.send('Voted\n')
}

async function voteIncreaseExecutionMaxLimit(req, res) {
  const epoch = await bridge.epoch()
  await processMessage(
    Action.INCREASE_EXECUTION_MAX_TX_LIMIT,
    epoch,
    padZeros(req.limit, 24),
    padZeros(req.attempt.toString(16), 34)
  )
  res.send('Voted\n')
}

async function transfer(req, res) {
  logger.info('Transfer start')
  const {
    hash, to, value, epoch
  } = req.body
  if (ethers.utils.isHexString(to, 20)) {
    logger.info(`Calling transfer to ${to}, 0x${value} tokens`)
    await processMessage(Action.TRANSFER, epoch, hash, to, padZeros(value, 24))
  }
  res.send()
  logger.info('Transfer end')
}

function normalizeTokens(value) {
  return parseFloat(new BN(value).dividedBy('1e18').toFixed(8, 3))
}

async function info(req, res) {
  try {
    const [
      foreignHexAddress, epoch, rangeSize, rangeSizeStartBlock, minPerTxLimit, maxPerTxLimit,
      executionMinLimit, executionMaxLimit, closeEpoch, nextCloseEpoch, epochStartBlock,
      foreignNonce, nextEpoch, threshold, nextThreshold, validators, nextValidators, bridgeStatus,
      homeBalance
    ] = await Promise.all([
      bridge.getForeignAddress(),
      bridge.epoch(),
      bridge.rangeSize(),
      bridge.rangeSizeStartBlock(),
      bridge.minPerTxLimit().then(normalizeTokens),
      bridge.maxPerTxLimit().then(normalizeTokens),
      bridge.executionMinLimit().then(normalizeTokens),
      bridge.executionMaxLimit().then(normalizeTokens),
      bridge.getCloseEpoch(),
      bridge.getNextCloseEpoch(),
      bridge.getStartBlock(),
      bridge.getNonce(),
      bridge.nextEpoch(),
      bridge.getThreshold(),
      bridge.getNextThreshold(),
      bridge.getValidators(),
      bridge.getNextValidators(),
      bridge.state(),
      token.balanceOf(HOME_BRIDGE_ADDRESS).then(normalizeTokens)
    ])
    const foreignAddress = hexAddressToBncAddress(foreignHexAddress)
    const balances = await getForeignBalances(foreignAddress)
    const msg = {
      epoch,
      rangeSize,
      rangeSizeStartBlock,
      minPerTxLimit,
      maxPerTxLimit,
      executionMinLimit,
      executionMaxLimit,
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
      bridgeStatus: decodeState(bridgeStatus)
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
}


app.use('/', logRequest)
app.get('/status', status)

app.post('/get', get)
app.post('/set', set)
app.post('/signupkeygen', signupKeygen)
app.post('/signupsign', signupSign)

app.post('/confirmKeygen', confirmKeygen)
app.post('/confirmFundsTransfer', confirmFundsTransfer)
app.post('/confirmCloseEpoch', confirmCloseEpoch)
app.post('/transfer', transfer)

votesProxyApp.use('/', logRequest)

votesProxyApp.get('/vote/startVoting', voteStartVoting)

votesProxyApp.use('/vote', parseNumber(true, 'attempt', 0))

votesProxyApp.get('/vote/startKeygen', voteStartKeygen)
votesProxyApp.get('/vote/cancelKeygen', voteCancelKeygen)
votesProxyApp.get('/vote/addValidator/:validator', parseAddress('validator'), voteAddValidator)
votesProxyApp.get('/vote/removeValidator/:validator', parseAddress('validator'), voteRemoveValidator)
votesProxyApp.get('/vote/changeThreshold/:threshold', parseNumber(false, 'threshold'), voteChangeThreshold)
votesProxyApp.get('/vote/changeCloseEpoch/:closeEpoch', parseBool('closeEpoch'), voteChangeCloseEpoch)
votesProxyApp.get('/vote/changeMinPerTxLimit/:limit', parseTokens('limit'), voteChangeMinPerTxLimit)
votesProxyApp.get('/vote/changeMaxPerTxLimit/:limit', parseTokens('limit'), voteChangeMaxPerTxLimit)
votesProxyApp.get('/vote/decreaseExecutionMinLimit/:limit', parseTokens('limit'), voteDecreaseExecutionMinLimit)
votesProxyApp.get('/vote/increaseExecutionMaxLimit/:limit', parseTokens('limit'), voteIncreaseExecutionMaxLimit)
votesProxyApp.get('/vote/changeRangeSize/:rangeSize', parseNumber(false, 'rangeSize'), voteChangeRangeSize)
votesProxyApp.get('/info', info)

async function main() {
  channel = await connectRabbit(RABBITMQ_URL)
  sideSendQueue = await assertQueue(channel, 'sideSendQueue')

  logger.warn(`My validator address in home and side networks is ${validatorAddress}`)

  app.listen(8001, () => {
    logger.debug('Proxy is listening on port 8001')
  })

  votesProxyApp.listen(8002, () => {
    logger.debug('Votes proxy is listening on port 8002')
  })
}

main()
