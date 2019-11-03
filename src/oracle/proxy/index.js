const express = require('express')
const Web3 = require('web3')
const AsyncLock = require('async-lock')
const axios = require('axios')
const BN = require('bignumber.js')
const { utils } = require('ethers')

const encode = require('./encode')
const decode = require('./decode')
const { createSender, waitForReceipt } = require('./sendTx')
const logger = require('./logger')
const { publicKeyToAddress } = require('./crypto')

const {
  HOME_RPC_URL, HOME_BRIDGE_ADDRESS, SIDE_RPC_URL, SIDE_SHARED_DB_ADDRESS, VALIDATOR_PRIVATE_KEY,
  HOME_TOKEN_ADDRESS, FOREIGN_URL, FOREIGN_ASSET
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
let homeSender
let sideSender

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const votesProxyApp = express()

async function main() {
  homeValidatorNonce = await homeWeb3.eth.getTransactionCount(validatorAddress)
  sideValidatorNonce = await sideWeb3.eth.getTransactionCount(validatorAddress)

  homeSender = await createSender(HOME_RPC_URL, VALIDATOR_PRIVATE_KEY)
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

function Ok(data) {
  return { Ok: data }
}

function Err(data) {
  return { Err: data }
}

function sideSendQuery(query) {
  return lock.acquire('home', async () => {
    logger.debug('Sending side query')
    const encodedABI = query.encodeABI()
    const senderResponse = await sideSender({
      data: encodedABI,
      to: SIDE_SHARED_DB_ADDRESS,
      nonce: sideValidatorNonce
    })
    if (senderResponse !== true) {
      sideValidatorNonce += 1
    }
    return senderResponse
  })
}

function homeSendQuery(query) {
  return lock.acquire('home', async () => {
    logger.debug('Sending home query')
    const encodedABI = query.encodeABI()
    const senderResponse = await homeSender({
      data: encodedABI,
      to: HOME_BRIDGE_ADDRESS,
      nonce: homeValidatorNonce
    })
    if (senderResponse !== true) {
      homeValidatorNonce += 1
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
    from = (await bridge.methods.getNextValidators()
      .call())[parseInt(req.body.key.first, 10) - 1]
  } else {
    const validators = await bridge.methods.getValidators()
      .call()
    from = await sharedDb.methods.getSignupAddress(
      uuid,
      validators, parseInt(req.body.key.first, 10)
    )
      .call()
  }
  const to = Number(req.body.key.fourth) // 0 if empty
  const key = homeWeb3.utils.sha3(`${round}_${to}`)

  const data = await sharedDb.methods.getData(from, sideWeb3.utils.sha3(uuid), key)
    .call()

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

async function signupKeygen(req, res) {
  logger.debug('SignupKeygen call')
  const epoch = (await bridge.methods.nextEpoch()
    .call()).toNumber()
  const partyId = (await bridge.methods.getNextPartyId(validatorAddress)
    .call()).toNumber()

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
  const hash = sideWeb3.utils.sha3(`0x${req.body.third}`)
  const query = sharedDb.methods.signupSign(hash)
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

  const validators = await bridge.methods.getValidators()
    .call()
  const id = (await sharedDb.methods.getSignupNumber(hash, validators, validatorAddress)
    .call()).toNumber()

  res.send(Ok({
    uuid: hash,
    number: id
  }))
  logger.debug('SignupSign end')
}

async function confirmKeygen(req, res) {
  logger.debug('Confirm keygen call')
  const { x, y } = req.body[5]
  const query = bridge.methods.confirmKeygen(`0x${x}`, `0x${y}`)
  await homeSendQuery(query)
  res.send()
  logger.debug('Confirm keygen end')
}

async function confirmFundsTransfer(req, res) {
  logger.debug('Confirm funds transfer call')
  const query = bridge.methods.confirmFundsTransfer()
  await homeSendQuery(query)
  res.send()
  logger.debug('Confirm funds transfer end')
}

async function sendVote(query, req, res, waitFlag = false) {
  try {
    const sentQuery = await homeSendQuery(query)
    let { txHash, gasLimit } = sentQuery
    if (txHash) {
      while (waitFlag) {
        const { status, gasUsed } = await waitForReceipt(HOME_RPC_URL, txHash)
        if (status === '0x1') {
          logger.debug('Receipt status is OK')
          break
        }
        if (gasLimit === gasUsed) {
          logger.info('Sending vote failed due to out of gas revert, retrying with more gas')
          const nextTx = await homeSendQuery(query)
          txHash = nextTx.txHash
          gasLimit = nextTx.gasLimit
        } else {
          logger.warn(`Vote tx was reverted, txHash ${txHash}`)
          break
        }
      }
    }
    if (sentQuery) {
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

async function voteStartVoting(req, res) {
  logger.info('Voting for starting new epoch voting process')
  const query = bridge.methods.startVoting()
  await sendVote(query, req, res, true)
}

async function voteStartKeygen(req, res) {
  logger.info('Voting for starting new epoch keygen')
  const query = bridge.methods.voteStartKeygen()
  await sendVote(query, req, res)
}

async function voteCancelKeygen(req, res) {
  logger.info('Voting for cancelling new epoch keygen')
  const query = bridge.methods.voteCancelKeygen()
  await sendVote(query, req, res)
}

async function voteAddValidator(req, res) {
  logger.info('Voting for adding new validator')
  const query = bridge.methods.voteAddValidator(req.params.validator)
  await sendVote(query, req, res)
}

async function voteChangeThreshold(req, res) {
  logger.info('Voting for changing threshold')
  const query = bridge.methods.voteChangeThreshold(req.params.threshold)
  await sendVote(query, req, res)
}

async function voteRemoveValidator(req, res) {
  logger.info('Voting for removing validator')
  const query = bridge.methods.voteRemoveValidator(req.params.validator)
  await sendVote(query, req, res, true)
}

function decodeStatus(status) {
  switch (status) {
    case 0:
      return 'ready'
    case 1:
      return 'voting'
    case 2:
      return 'keygen'
    case 3:
      return 'funds_transfer'
    default:
      return 'unknown_state'
  }
}

function boundX(x) {
  try {
    return x.toNumber()
  } catch (e) {
    return -1
  }
}

async function transfer(req, res) {
  logger.info('Transfer start')
  const { hash, to, value } = req.body
  if (homeWeb3.utils.isAddress(to)) {
    logger.info(`Calling transfer to ${to}, ${value} tokens`)
    const query = bridge.methods.transfer(hash, to, `0x${new BN(value).toString(16)}`)
    await homeSendQuery(query)
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
      x, y, epoch, rangeSize, nextRangeSize, epochStartBlock, foreignNonce, nextEpoch,
      threshold, nextThreshold, validators, nextValidators, status, homeBalance
    ] = await Promise.all([
      bridge.methods.getX()
        .call()
        .then((value) => new BN(value).toString(16)),
      bridge.methods.getY()
        .call()
        .then((value) => new BN(value).toString(16)),
      bridge.methods.epoch()
        .call()
        .then(boundX),
      bridge.methods.getRangeSize()
        .call()
        .then(boundX),
      bridge.methods.getNextRangeSize()
        .call()
        .then(boundX),
      bridge.methods.getStartBlock()
        .call()
        .then(boundX),
      bridge.methods.getNonce()
        .call()
        .then(boundX),
      bridge.methods.nextEpoch()
        .call()
        .then(boundX),
      bridge.methods.getThreshold()
        .call()
        .then(boundX),
      bridge.methods.getNextThreshold()
        .call()
        .then(boundX),
      bridge.methods.getValidators()
        .call(),
      bridge.methods.getNextValidators()
        .call(),
      bridge.methods.status()
        .call(),
      token.methods.balanceOf(HOME_BRIDGE_ADDRESS)
        .call()
        .then((value) => parseFloat(new BN(value).dividedBy(10 ** 18)
          .toFixed(8, 3)))
    ])
    const [
      confirmationsForFundsTransfer, votesForVoting, votesForKeygen, votesForCancelKeygen
    ] = await Promise.all([
      bridge.methods.votesCount(homeWeb3.utils.sha3(utils.solidityPack(['uint8', 'uint256'], [1, nextEpoch])))
        .call()
        .then(boundX),
      bridge.methods.votesCount(homeWeb3.utils.sha3(utils.solidityPack(['uint8', 'uint256'], [2, nextEpoch])))
        .call()
        .then(boundX),
      bridge.methods.votesCount(homeWeb3.utils.sha3(utils.solidityPack(['uint8', 'uint256'], [7, nextEpoch])))
        .call()
        .then(boundX),
      bridge.methods.votesCount(homeWeb3.utils.sha3(utils.solidityPack(['uint8', 'uint256'], [8, nextEpoch])))
        .call()
        .then(boundX)
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
      homeBridgeAddress: HOME_BRIDGE_ADDRESS,
      foreignBridgeAddress: foreignAddress,
      foreignNonce,
      validators,
      nextValidators,
      homeBalance,
      foreignBalanceTokens: parseFloat(balances[FOREIGN_ASSET]) || 0,
      foreignBalanceNative: parseFloat(balances.BNB) || 0,
      bridgeStatus: decodeStatus(status),
      votesForVoting,
      votesForKeygen,
      votesForCancelKeygen,
      confirmationsForFundsTransfer
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
app.post('/transfer', transfer)

votesProxyApp.get('/vote/startVoting', voteStartVoting)
votesProxyApp.get('/vote/startKeygen', voteStartKeygen)
votesProxyApp.get('/vote/cancelKeygen', voteCancelKeygen)
votesProxyApp.get('/vote/addValidator/:validator', voteAddValidator)
votesProxyApp.get('/vote/removeValidator/:validator', voteRemoveValidator)
votesProxyApp.get('/vote/changeThreshold/:threshold', voteChangeThreshold)
votesProxyApp.get('/info', info)
