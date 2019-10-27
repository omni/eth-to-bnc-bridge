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

module.exports = async function (privateKey) {
  const wallet = new ethers.Wallet(privateKey, provider)
  const ethAddress = wallet.address
  const bncAddress = getAddressFromPrivateKey(privateKey)
  const token = tokenContract.connect(wallet)
  const bridge = bridgeContract.connect(wallet)

  const bncClient = await createBncClient(privateKey)

  return {
    getEthBalance: async function () {
      const balance = await token.balanceOf(ethAddress)
      return parseFloat(new BN(balance).dividedBy(10 ** 18).toFixed(8, 3))
    },
    transferEth: async function (to, value) {
      const tx = await token.transfer(to, '0x' + (new BN(value).multipliedBy(10 ** 18).toString(16)), txOptions)
      await tx.wait()
    },
    approveEth: async function (to, value) {
      console.log('approving', to, value)
      const tx = await token.approve(to, '0x' + (new BN(value).multipliedBy(10 ** 18).toString(16)), txOptions)
      console.log('sent', tx)
      await tx.wait()
      console.log('done')
      console.log(await token.allowance(ethAddress, to))
    },
    exchangeEth: async function (value) {
      console.log(value)
      const tx = await bridge.exchange('0x' + (new BN(value).multipliedBy(10 ** 18).toString(16)), txOptions)
      console.log(tx)
      await tx.wait()
      console.log('done')
    },
    getBncBalance: async function () {
      const balance = await getBalance(bncAddress)
      await delay(1000)
      return balance
    },
    transferBnc: async function (bridgeAddress, tokens, bnbs) {
      return await bncClient.transfer(bridgeAddress, tokens, bnbs)
    },
    exchangeBnc: async function (bridgeAddress, value) {
      return await bncClient.exchange(bridgeAddress, value)
    }
  }
}
