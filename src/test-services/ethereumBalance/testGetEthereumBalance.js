const Web3 = require('web3')
const BN = require('bignumber.js')

const { HOME_RPC_URL, HOME_TOKEN_ADDRESS } = process.env

const abiToken = require('./IERC20').abi

const web3 = new Web3(HOME_RPC_URL, null, { transactionConfirmationBlocks: 1 })
const token = new web3.eth.Contract(abiToken, HOME_TOKEN_ADDRESS)

function main() {
  const address = process.argv[2]

  web3.eth.getBalance(address)
    .then((balance) => console.log(`${balance.toString()} wei`))

  token.methods.balanceOf(address)
    .call()
    .then((balance) => parseFloat(new BN(balance).dividedBy(10 ** 18)
      .toFixed(8, 3)))
    .then((balance) => console.log(`${balance.toString()} tokens`))
    .catch(() => console.log('0 tokens'))
}

main()
