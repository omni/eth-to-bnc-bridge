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

async function createUser(privateKey, network) {
  const opts = {}
  if (network !== 'bnc') {
    opts.providerSide = new ethers.providers.JsonRpcProvider(SIDE_RPC_URL)
    opts.walletSide = new ethers.Wallet(privateKey, opts.providerSide)
    opts.wallet = new ethers.Wallet(privateKey, provider)
    opts.ethAddress = opts.wallet.address
    opts.token = tokenContract.connect(opts.wallet)
    opts.bridge = bridgeContract.connect(opts.wallet)
  }
  if (network !== 'eth') {
    opts.bncAddress = getAddressFromPrivateKey(privateKey)
    opts.bncClient = await createBncClient(privateKey)
  }

  return {
    ethAddress: opts.ethAddress,
    bncAddress: opts.bncAddress,
    async getEthBalance() {
      const balance = await opts.wallet.getBalance()
      return parseFloat(new BN(balance).dividedBy(10 ** 18).toFixed(8, 3))
    },
    async getSideEthBalance() {
      const balance = await opts.walletSide.getBalance()
      return parseFloat(new BN(balance).dividedBy(10 ** 18).toFixed(8, 3))
    },
    async getErcBalance() {
      const balance = await opts.token.balanceOf(opts.ethAddress)
      return parseFloat(new BN(balance).dividedBy(10 ** 18).toFixed(8, 3))
    },
    async transferEth(to, value) {
      const tx = await opts.wallet.sendTransaction(
        {
          to,
          value: `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`
        },
        txOptions
      )
      await tx.wait()
    },
    async transferEthSide(to, value) {
      const tx = await opts.walletSide.sendTransaction(
        {
          to,
          value: `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`
        },
        txOptions
      )
      await tx.wait()
    },
    async transferErc(to, value) {
      const tx = await opts.token.transfer(
        to,
        `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`,
        txOptions
      )
      await tx.wait()
    },
    async approveErc(to, value) {
      const tx = await opts.token.approve(
        to,
        `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`,
        txOptions
      )
      await tx.wait()
    },
    async exchangeErc(value) {
      const tx = await opts.bridge.exchange(
        `0x${new BN(value).multipliedBy(10 ** 18).toString(16)}`,
        txOptions
      )
      await tx.wait()
    },
    async getBnbBalance() {
      const balance = await getBnbBalance(opts.bncAddress)
      await delay(1000)
      return balance
    },
    async getBepBalance() {
      const balance = await getBepBalance(opts.bncAddress)
      await delay(1000)
      return balance
    },
    async transferBepBnb(to, tokens, bnbs) {
      return await opts.bncClient.transfer(to, tokens, bnbs)
    },
    async exchangeBep(bridgeAddress, value) {
      return await opts.bncClient.exchange(bridgeAddress, value)
    }
  }
}

module.exports = createUser
