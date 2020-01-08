const ethers = require('ethers')
const { retry } = require('./wait')

class RetryProvider extends ethers.providers.JsonRpcProvider {
  constructor(attempts, url) {
    super(url)
    this.attempts = attempts
  }

  perform(method, params) {
    return retry(() => super.perform(method, params), this.attempts)
  }
}

function createProvider(rpcUrl) {
  return new RetryProvider(-1, rpcUrl)
}

module.exports = createProvider
