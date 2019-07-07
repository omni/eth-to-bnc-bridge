require('dotenv').config()

const Web3 = require('web3')

const { HOME_RPC_URL, HOME_BRIDGE_ADDRESS, HOME_CHAIN_ID, DEPLOY_PRIVATE_KEY, HOME_TOKEN_ADDRESS } = process.env
const web3 = new Web3(HOME_RPC_URL, null, { transactionConfirmationBlocks: 1 })
const abiBridge = require('../deploy/deploy-home/build/contracts/SharedDB').abi
const abiToken = require('../deploy/deploy-home/build/contracts/IERC20').abi
const bridge = new web3.eth.Contract(abiBridge, HOME_BRIDGE_ADDRESS)
const token = new web3.eth.Contract(abiToken, HOME_TOKEN_ADDRESS)

const query1 = token.methods.approve(HOME_BRIDGE_ADDRESS, 1)
const query2 = bridge.methods.requestAffirmation(1, 'tbnb1h3nmmqukrtjc0prmtdts0kxlgmw8rend4zfasn')

let nonce
const deployAddress = web3.eth.accounts.privateKeyToAccount(`0x${DEPLOY_PRIVATE_KEY}`).address

async function main () {
  console.log(deployAddress)
  nonce = await web3.eth.getTransactionCount(deployAddress)
  await sendQuery(query1, HOME_TOKEN_ADDRESS)
  await sendQuery(query2, HOME_BRIDGE_ADDRESS)
}

async function sendQuery (query, to) {
  const encodedABI = query.encodeABI()
  const tx = {
    data: encodedABI,
    from: deployAddress,
    to,
    nonce: nonce++,
    chainId: parseInt(HOME_CHAIN_ID)
  }
  tx.gas = Math.min(Math.ceil(await query.estimateGas(tx) * 1.5), 6721975)
  const signedTx = await web3.eth.accounts.signTransaction(tx, DEPLOY_PRIVATE_KEY)

  return await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
}

main()
