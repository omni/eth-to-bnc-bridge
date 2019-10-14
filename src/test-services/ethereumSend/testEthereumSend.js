const Web3 = require('web3')
const BN = require('bignumber.js')

const { HOME_RPC_URL, HOME_BRIDGE_ADDRESS, HOME_PRIVATE_KEY, HOME_TOKEN_ADDRESS } = process.env

const abiToken = require('./IERC20').abi
const abiBridge = require('./Bridge').abi

const PRIVATE_KEY = process.env.PRIVATE_KEY || HOME_PRIVATE_KEY

const web3 = new Web3(HOME_RPC_URL, null, { transactionConfirmationBlocks: 1 })
const token = new web3.eth.Contract(abiToken, HOME_TOKEN_ADDRESS)
const bridge = new web3.eth.Contract(abiBridge, HOME_BRIDGE_ADDRESS)

const sender = web3.eth.accounts.privateKeyToAccount(`0x${PRIVATE_KEY}`).address

async function main () {
  const HOME_CHAIN_ID = await web3.eth.net.getId()
  const blockGasLimit = (await web3.eth.getBlock("latest", false)).gasLimit

  const to = process.argv[2]

  const amount = parseInt(process.argv[3])
  let coins = process.argv[4]

  const txCount = await web3.eth.getTransactionCount(sender)

  if (to === "bridge" && amount !== 0) {
    console.log(`Transfer from ${sender} to ${HOME_BRIDGE_ADDRESS}, ${amount} tokens`)

    const queryApprove = token.methods.approve(HOME_BRIDGE_ADDRESS, '0x'+(new BN(amount).multipliedBy(10 ** 18).toString(16)))
    const txApprove = {
      data: queryApprove.encodeABI(),
      from: sender,
      to: HOME_TOKEN_ADDRESS,
      nonce: txCount,
      chainId: HOME_CHAIN_ID
    }
    txApprove.gas = Math.min(Math.ceil(await queryApprove.estimateGas({
      from: sender
    }) * 1.5), blockGasLimit)
    const signedTxApprove = await web3.eth.accounts.signTransaction(txApprove, PRIVATE_KEY)

    const receiptApprove = await web3.eth.sendSignedTransaction(signedTxApprove.rawTransaction)
    console.log('txHash approve: ' + receiptApprove.transactionHash)

    const queryExchange = bridge.methods.exchange('0x'+(new BN(amount).multipliedBy(10 ** 18).toString(16)))
    const txExchange = {
      data: queryExchange.encodeABI(),
      from: sender,
      to: HOME_BRIDGE_ADDRESS,
      nonce: txCount + 1,
      chainId: HOME_CHAIN_ID
    }
    txExchange.gas = Math.min(Math.ceil(await queryExchange.estimateGas({
      from: sender
    }) * 1.5), blockGasLimit)
    const signedTxExchange = await web3.eth.accounts.signTransaction(txExchange, PRIVATE_KEY)

    const receiptExchange = await web3.eth.sendSignedTransaction(signedTxExchange.rawTransaction)
    console.log('txHash exchange: ' + receiptExchange.transactionHash)
  } else if (amount !== 0) {
    console.log(`Transfer from ${sender} to ${to}, ${amount} tokens`)

    const query = token.methods.transfer(to, '0x'+(new BN(amount).multipliedBy(10 ** 18).toString(16)))
    const tx = {
      data: query.encodeABI(),
      from: sender,
      to: HOME_TOKEN_ADDRESS,
      nonce: txCount,
      chainId: HOME_CHAIN_ID
    }
    tx.gas = Math.min(Math.ceil(await query.estimateGas({
      from: sender
    }) * 1.5), blockGasLimit)
    const signedTx = await web3.eth.accounts.signTransaction(tx, PRIVATE_KEY)
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    console.log('txHash transfer: ' + receipt.transactionHash)
  }

  if (coins) {
    coins = parseFloat(coins)
    console.log(`Transfer from ${sender} to ${to}, ${coins} coins`)

    const tx = {
      data: '0x',
      from: sender,
      to: to,
      nonce: await web3.eth.getTransactionCount(sender),
      chainId: HOME_CHAIN_ID,
      value: web3.utils.toWei(new BN(coins).toString(), 'ether'),
      gas: 21000
    }
    const signedTx = await web3.eth.accounts.signTransaction(tx, PRIVATE_KEY)

    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    console.log('txHash: ' + receipt.transactionHash)
  }

}

main()
