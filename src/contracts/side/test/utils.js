const { expect } = require('chai')
const { BN } = require('./setup')

async function sign(address, data) {
  const signature = await web3.eth.sign(data, address)
  return `${signature.substr(0, 130)}${(parseInt(signature.substr(130), 16) + 27).toString(16)}`
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

function expectEventNotInLogs(logs, eventName) {
  const events = logs.filter((e) => e.event === eventName)
  expect(events.length).to.equal(0, `There is '${eventName}'`)
}

function keccak256(message) {
  return web3.eth.accounts.hashMessage(message)
}

function stripHex(s) {
  return isHex(s) ? s.substr(2) : s
}

module.exports = {
  sign,
  expectEventInLogs,
  expectEventNotInLogs,
  keccak256,
  stripHex
}
