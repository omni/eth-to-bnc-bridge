require('dotenv').config()

const Web3 = require('web3')

const { RPC_URL_DEV, SHARED_DB_ADDRESS, DEPLOY_PRIVATE_KEY, TOKEN_ADDRESS } = process.env
const web3 = new Web3(RPC_URL_DEV, null, { transactionConfirmationBlocks: 1 })
const abiBridge = require('../deploy/build/contracts/SharedDB').abi
const abiToken = require('../deploy/build/contracts/IERC20').abi
const bridge = new web3.eth.Contract(abiBridge, SHARED_DB_ADDRESS)
const token = new web3.eth.Contract(abiToken, TOKEN_ADDRESS)

const query1 = token.methods.approve(SHARED_DB_ADDRESS, 1)
const query2 = bridge.methods.requestAffirmation(1, 'tbnb1h3nmmqukrtjc0prmtdts0kxlgmw8rend4zfasn')

let nonce
const deployAddress = web3.eth.accounts.privateKeyToAccount(`0x${DEPLOY_PRIVATE_KEY}`).address

async function main () {
  console.log(deployAddress)
  nonce = await web3.eth.getTransactionCount(deployAddress)
  await sendQuery(query1, TOKEN_ADDRESS)
  await sendQuery(query2, SHARED_DB_ADDRESS)
}

async function sendQuery (query, to) {
  const encodedABI = query.encodeABI()
  const tx = {
    data: encodedABI,
    from: deployAddress,
    to,
    nonce: nonce++,
    chainId: 33
  }
  tx.gas = Math.min(Math.ceil(await query.estimateGas(tx) * 1.5), 6721975)
  const signedTx = await web3.eth.accounts.signTransaction(tx, DEPLOY_PRIVATE_KEY)

  const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)

  return receipt
}

main()
