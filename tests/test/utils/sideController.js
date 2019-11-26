const ethers = require('ethers')

const { SIDE_RPC_URL } = process.env

const provider = new ethers.providers.JsonRpcProvider(SIDE_RPC_URL)

module.exports = {
  async getNonce(address) {
    return await provider.getTransactionCount(address)
  }
}
