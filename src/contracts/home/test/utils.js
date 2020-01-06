const { expect } = require('chai')
const { BN } = require('./setup')

const State = {
  READY: '0',
  CLOSING_EPOCH: '1',
  VOTING: '2',
  KEYGEN: '3',
  FUNDS_TRANSFER: '4'
}

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
  TRANSFER: 11,
  UNKNOWN_MESSAGE: 255
}

async function getDeployResult(contract) {
  const transactionReceipt = await web3.eth.getTransactionReceipt(contract.transactionHash)
  const { blockNumber } = transactionReceipt
  const eventList = await contract.getPastEvents('allEvents', {
    fromBlock: blockNumber,
    toBlock: blockNumber
  })
  return {
    tx: contract.transactionHash,
    receipt: transactionReceipt,
    logs: eventList.filter((ev) => ev.transactionHash === contract.transactionHash)
  }
}

function isHex(s) {
  return web3.utils.isHexStrict(s)
}

function contains(args, key, value) {
  expect(key in args).to.equal(true, `Unknown event argument '${key}'`)

  if (value === null) {
    expect(args[key]).to.equal(null)
  } else if (BN.isBN(args[key])) {
    if (isHex(value)) {
      expect(args[key]).to.be.bignumber.equal(new BN(value.substr(2), 16))
    } else {
      expect(args[key]).to.be.bignumber.equal(value)
    }
  } else {
    expect(args[key]).to.be.equal(value)
  }
}

function expectEventInLogs(logs, eventName, eventArgs = {}) {
  const events = logs.filter((e) => e.event === eventName)
  expect(events.length > 0).to.equal(true, `There is no '${eventName}'`)

  const exception = []
  const event = events.find((e) => Object.entries(eventArgs).every(([k, v]) => {
    try {
      contains(e.args, k, v)
      return true
    } catch (error) {
      exception.push(error)
      return false
    }
  }))

  if (event === undefined) {
    throw exception[0]
  }

  return event
}

function padZeros(arg, len) {
  let s = typeof arg === 'number' ? arg.toString(16) : arg.toString()
  while (s.length < len) {
    // eslint-disable-next-line no-param-reassign
    s = `0${s}`
  }
  return s
}

function buildMessage(type, epoch, ...args) {
  return `0x${padZeros(type, 2)}${padZeros(epoch, 4)}${args.reduce(((previousValue, currentValue) => previousValue + currentValue), '')}`
}

async function sign(address, data) {
  const signature = await web3.eth.sign(data, address)
  return `${signature.substr(0, 130)}${(parseInt(signature.substr(130), 16) + 27).toString(16)}`
}

function stripHex(s) {
  return isHex(s) ? s.substr(2) : s
}

async function skipBlocks(n = 1) {
  for (let i = 0; i < n; i += 1) {
    await web3.eth.sendTransaction({
      from: '0xA374DC09057D6B3253d04fACb15736B43fBc7943',
      gasPrice: '20000000000',
      gas: '21000',
      to: '0x99Eb3D86663c6Db090eFFdBC20510Ca9f836DCE3',
      value: '1'
    })
  }
}

module.exports = {
  State,
  Action,
  getDeployResult,
  expectEventInLogs,
  buildMessage,
  stripHex,
  sign,
  skipBlocks
}
