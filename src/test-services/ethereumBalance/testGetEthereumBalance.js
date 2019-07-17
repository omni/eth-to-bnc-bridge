const Web3 = require('web3')

const { HOME_RPC_URL, HOME_TOKEN_ADDRESS } = process.env

const abiToken = require('./IERC20').abi

const web3 = new Web3(HOME_RPC_URL, null, { transactionConfirmationBlocks: 1 })
const token = new web3.eth.Contract(abiToken, HOME_TOKEN_ADDRESS)

const address = process.argv[2]

token.methods.balanceOf(address).call()
  .then(x => console.log(x.toNumber()))
  .catch(() => console.log(0))
