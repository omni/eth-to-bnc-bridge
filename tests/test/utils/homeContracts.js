const ethers = require('ethers')

const { HOME_RPC_URL, HOME_TOKEN_ADDRESS, HOME_BRIDGE_ADDRESS } = process.env

const abiToken = [
  'function balanceOf(address account) view returns (uint)',
  'function transfer(address to, uint value)',
  'function approve(address to, uint value)',
  'function allowance(address owner, address spender) view returns (uint)'
]
const abiBridge = [
  'function exchange(uint96 value)'
]

const provider = new ethers.providers.JsonRpcProvider(HOME_RPC_URL)

const tokenContract = new ethers.Contract(HOME_TOKEN_ADDRESS, abiToken, provider)
const bridgeContract = new ethers.Contract(HOME_BRIDGE_ADDRESS, abiBridge, provider)

module.exports = {
  tokenContract,
  bridgeContract,
  provider
}
