const ethers = require('ethers')
const BN = require('bignumber.js')
const { getAddressFromPrivateKey } = require('@binance-chain/javascript-sdk/lib/crypto')

const createBncClient = require('./bncClient')
const { getBalance } = require('./bncController')
const { tokenContract, bridgeContract, provider } = require('./homeContracts')
const { delay } = require('./wait')

const txOptions = {
  gasLimit: 200000
}

async function createUser(privateKey) {
  const wallet = new ethers.Wallet(privateKey, provider)
  const ethAddress = wallet.address
  const bncAddress = getAddressFromPrivateKey(privateKey)
  const token = tokenContract.connect(wallet)
  const bridge = bridgeContract.connect(wallet)

  const bncClient = await createBncClient(privateKey)

  return {
    ethAddress,
    bncAddress,
    async getEthBalance() {
      const balance = await token.balanceOf(ethAddress)
      return parseFloat(new BN(balance).dividedBy(10 ** 18).toFixed(8, 3))
    },
    async transferEth(to, value) {
      const tx = await token.transfer(to, `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`, txOptions)
      await tx.wait()
    },
    async approveEth(to, value) {
      const tx = await token.approve(to, `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`, txOptions)
      await tx.wait()
    },
    async exchangeEth(value) {
      const tx = await bridge.exchange(`0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`, txOptions)
      await tx.wait()
    },
    async getBncBalance() {
      const balance = await getBalance(bncAddress)
      await delay(1000)
      return balance
    },
    async transferBnc(bridgeAddress, tokens, bnbs) {
      return await bncClient.transfer(bridgeAddress, tokens, bnbs)
    },
    async exchangeBnc(bridgeAddress, value) {
      return await bncClient.exchange(bridgeAddress, value)
    }
  }
}

module.exports = createUser
