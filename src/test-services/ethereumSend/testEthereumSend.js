const Web3 = require('web3')
const BN = require('bignumber.js')

const { HOME_RPC_URL, HOME_BRIDGE_ADDRESS, HOME_PRIVATE_KEY, HOME_TOKEN_ADDRESS } = process.env

const abiToken = require('./IERC20').abi

const web3 = new Web3(HOME_RPC_URL, null, { transactionConfirmationBlocks: 1 })
const token = new web3.eth.Contract(abiToken, HOME_TOKEN_ADDRESS)

const sender = web3.eth.accounts.privateKeyToAccount(`0x${HOME_PRIVATE_KEY}`).address

async function main () {
  const HOME_CHAIN_ID = await web3.eth.net.getId()
  const blockGasLimit = (await web3.eth.getBlock("latest", false)).gasLimit

  let to = process.argv[2]

  if (to === "bridge") {
    to = HOME_BRIDGE_ADDRESS
  }

  const amount = parseInt(process.argv[3])
  let coins = process.argv[4]

  if (amount !== 0) {
    console.log(`Transfer from ${sender} to ${to}, ${amount} tokens`)

    const query = token.methods.transfer(to, '0x'+(new BN(amount).multipliedBy(10 ** 18).toString(16)))
    const encodedABI = query.encodeABI()
    const tx = {
      data: encodedABI,
      from: sender,
      to: HOME_TOKEN_ADDRESS,
      nonce: await web3.eth.getTransactionCount(sender),
      chainId: HOME_CHAIN_ID
    }
    tx.gas = Math.min(Math.ceil(await query.estimateGas({
      from: sender
    }) * 1.5), blockGasLimit)
    let signedTx = await web3.eth.accounts.signTransaction(tx, HOME_PRIVATE_KEY)

    let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    console.log('txHash: ' + receipt.transactionHash)
  }

  if (coins) {
    coins = parseFloat(coins)
    console.log(`Transfer from ${sender} to ${to}, ${coins} coins`)

    const tx_coins = {
      data: '0x',
      from: sender,
      to: to,
      nonce: await web3.eth.getTransactionCount(sender),
      chainId: HOME_CHAIN_ID,
      value: web3.utils.toWei(new BN(coins).toString(), 'ether'),
      gas: 21000
    }
    const signedTx = await web3.eth.accounts.signTransaction(tx_coins, HOME_PRIVATE_KEY)

    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    console.log('txHash: ' + receipt.transactionHash)
  }

}

main()
