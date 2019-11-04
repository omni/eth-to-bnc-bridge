const ethers = require('ethers')
const BN = require('bignumber.js')

const { HOME_RPC_URL, HOME_TOKEN_ADDRESS } = process.env

const tokenAbi = [
  'function balanceOf(address account) view returns (uint256)'
]

const provider = new ethers.providers.JsonRpcProvider(HOME_RPC_URL)
const token = new ethers.Contract(HOME_TOKEN_ADDRESS, tokenAbi, provider)

async function main() {
  const address = process.argv[2]

  const ethBalance = await provider.getBalance(address)
  console.log(`${ethBalance.toString()} wei`)

  try {
    const ercBalance = await token.balanceOf(address)
    const floatBalance = new BN(ercBalance).dividedBy(10 ** 18).toFixed(8, 3)
    console.log(`${floatBalance.toString()} tokens`)
  } catch (e) {
    console.log('0 tokens')
  }
}

main()
