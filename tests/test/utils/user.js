const ethers = require('ethers')
const BN = require('bignumber.js')
const { getAddressFromPrivateKey } = require('@binance-chain/javascript-sdk/lib/crypto')

const createBncClient = require('./bncClient')
const { getBnbBalance, getBepBalance } = require('./bncController')
const { tokenContract, bridgeContract, provider } = require('./homeContracts')
const { delay } = require('./wait')

const txOptions = {
  gasLimit: 200000
}

const { SIDE_RPC_URL } = process.env

async function createUser(privateKey) {
  const providerSide = new ethers.providers.JsonRpcProvider(SIDE_RPC_URL)
  const walletSide = new ethers.Wallet(privateKey, providerSide)
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
      const balance = await wallet.getBalance()
      return parseFloat(new BN(balance).dividedBy(10 ** 18).toFixed(8, 3))
    },
    async getSideEthBalance() {
      const balance = await walletSide.getBalance()
      return parseFloat(new BN(balance).dividedBy(10 ** 18).toFixed(8, 3))
    },
    async getErcBalance() {
      const balance = await token.balanceOf(ethAddress)
      return parseFloat(new BN(balance).dividedBy(10 ** 18).toFixed(8, 3))
    },
    async transferEth(to, value) {
      const tx = await wallet.sendTransaction(
        {
          to,
          value: `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`
        },
        txOptions
      )
      await tx.wait()
    },
    async transferEthSide(to, value) {
      const tx = await walletSide.sendTransaction(
        {
          to,
          value: `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`
        },
        txOptions
      )
      await tx.wait()
    },
    async transferErc(to, value) {
      const tx = await token.transfer(
        to,
        `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`,
        txOptions
      )
      await tx.wait()
    },
    async approveErc(to, value) {
      const tx = await token.approve(
        to,
        `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`,
        txOptions
      )
      await tx.wait()
    },
    async exchangeErc(value) {
      const tx = await bridge.exchange(
        `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`,
        txOptions
      )
      await tx.wait()
    },
    async getBnbBalance() {
      const balance = await getBnbBalance(bncAddress)
      await delay(1000)
      return balance
    },
    async getBepBalance() {
      const balance = await getBepBalance(bncAddress)
      await delay(1000)
      return balance
    },
    async transferBepBnb(to, tokens, bnbs) {
      return await bncClient.transfer(to, tokens, bnbs)
    },
    async exchangeBep(bridgeAddress, value) {
      return await bncClient.exchange(bridgeAddress, value)
    }
  }
}

module.exports = createUser
