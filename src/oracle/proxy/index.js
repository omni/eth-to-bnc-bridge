const express = require('express')
const AsyncLock = require('async-lock')
const axios = require('axios')
const BN = require('bignumber.js')
const ethers = require('ethers')

const { tokenAbi, bridgeAbi, sharedDbAbi } = require('./contractsAbi')
const {
  Ok, Err, decodeStatus, boundX
} = require('./utils')
const encode = require('./encode')
const decode = require('./decode')
const { createSender, waitForReceipt } = require('./sendTx')
const logger = require('./logger')
const { publicKeyToAddress } = require('./crypto')

const {
  HOME_RPC_URL, HOME_BRIDGE_ADDRESS, SIDE_RPC_URL, SIDE_SHARED_DB_ADDRESS, VALIDATOR_PRIVATE_KEY,
  HOME_TOKEN_ADDRESS, FOREIGN_URL, FOREIGN_ASSET
} = process.env

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

let homeValidatorNonce
let sideValidatorNonce
let homeSender
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

function homeSendQuery(query) {
  return lock.acquire('home', async () => {
    logger.debug('Sending home query')
    const senderResponse = await homeSender({
      data: query,
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
  const epoch = (await bridge.nextEpoch()).toNumber()
  const partyId = (await bridge.getNextPartyId(validatorAddress)).toNumber()

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
  const query = sharedDb.interface.functions.signupSign.encode([hash])
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
  const id = (await sharedDb.getSignupNumber(hash, validators, validatorAddress)).toNumber()

  res.send(Ok({
    uuid: hash,
    number: id
  }))
  logger.debug('SignupSign end')
}

async function confirmKeygen(req, res) {
  logger.debug('Confirm keygen call')
  const { x, y } = req.body[5]
  const query = bridge.interface.functions.confirmKeygen.encode([`0x${x}`, `0x${y}`])
  await homeSendQuery(query)
  res.send()
  logger.debug('Confirm keygen end')
}

async function confirmFundsTransfer(req, res) {
  logger.debug('Confirm funds transfer call')
  const query = bridge.interface.functions.confirmFundsTransfer.encode([])
  await homeSendQuery(query)
  res.send()
  logger.debug('Confirm funds transfer end')
}

async function confirmCloseEpoch(req, res) {
  logger.debug('Confirm close epoch call')
  const query = bridge.interface.functions.confirmCloseEpoch.encode([])
  await homeSendQuery(query)
  res.send()
  logger.debug('Confirm close epoch end')
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
  const query = bridge.interface.functions.startVoting.encode([])
  await sendVote(query, req, res, true)
}

async function voteStartKeygen(req, res) {
  logger.info('Voting for starting new epoch keygen')
  const query = bridge.interface.functions.voteStartKeygen.encode([])
  await sendVote(query, req, res)
}

async function voteCancelKeygen(req, res) {
  logger.info('Voting for cancelling new epoch keygen')
  const query = bridge.interface.functions.voteCancelKeygen.encode([])
  await sendVote(query, req, res)
}

async function voteAddValidator(req, res) {
  if (ethers.utils.isHexString(req.params.validator, 20)) {
    logger.info('Voting for adding new validator')
    const query = bridge.interface.functions.voteAddValidator.encode([req.params.validator])
    await sendVote(query, req, res)
  }
}

async function voteChangeThreshold(req, res) {
  if (/^[0-9]+$/.test(req.params.threshold)) {
    logger.info('Voting for changing threshold')
    const query = bridge.interface.functions.voteChangeThreshold.encode([req.params.threshold])
    await sendVote(query, req, res)
  }
}

async function voteChangeCloseEpoch(req, res) {
  if (req.params.closeEpoch === 'true' || req.params.closeEpoch === 'false') {
    logger.info('Voting for changing close epoch')
    const query = bridge.interface.functions.voteChangeCloseEpoch.encode([req.params.closeEpoch === 'true'])
    await sendVote(query, req, res)
  }
}

async function voteRemoveValidator(req, res) {
  if (ethers.utils.isHexString(req.params.validator, 20)) {
    logger.info('Voting for removing validator')
    const query = bridge.interface.functions.voteRemoveValidator.encode([req.params.validator])
    await sendVote(query, req, res, true)
  }
}

async function transfer(req, res) {
  logger.info('Transfer start')
  const { hash, to, value } = req.body
  if (ethers.utils.isHexString(to, 20)) {
    logger.info(`Calling transfer to ${to}, ${value} tokens`)
    const query = bridge.interface.functions.transfer.encode([hash, to, `0x${new BN(value).toString(16)}`])
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

function getVotesCount(nextEpoch, voteType) {
  return bridge.votesCount(
    ethers.utils.keccak256(ethers.utils.solidityPack(['uint8', 'uint256'], [voteType, nextEpoch]))
  ).then(boundX)
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
      bridge.epoch().then(boundX),
      bridge.getRangeSize().then(boundX),
      bridge.getNextRangeSize().then(boundX),
      bridge.getCloseEpoch(),
      bridge.getNextCloseEpoch(),
      bridge.getStartBlock().then(boundX),
      bridge.getNonce().then(boundX),
      bridge.nextEpoch().then(boundX),
      bridge.getThreshold().then(boundX),
      bridge.getNextThreshold().then(boundX),
      bridge.getValidators(),
      bridge.getNextValidators(),
      bridge.status().then(boundX),
      token.balanceOf(HOME_BRIDGE_ADDRESS)
        .then((value) => parseFloat(new BN(value).dividedBy(10 ** 18).toFixed(8, 3)))
    ])
    const [
      confirmationsForFundsTransfer, votesForVoting, votesForKeygen, votesForCancelKeygen
    ] = await Promise.all([
      getVotesCount(nextEpoch, 1),
      getVotesCount(nextEpoch, 2),
      getVotesCount(nextEpoch, 7),
      getVotesCount(nextEpoch, 8)
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
  homeValidatorNonce = await homeWallet.getTransactionCount()
  sideValidatorNonce = await sideWallet.getTransactionCount()

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
