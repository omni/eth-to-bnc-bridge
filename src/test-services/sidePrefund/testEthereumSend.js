const Web3 = require('web3')
const BN = require('bignumber.js')

const { SIDE_RPC_URL, SIDE_PRIVATE_KEY } = process.env

const web3 = new Web3(SIDE_RPC_URL, null, { transactionConfirmationBlocks: 1 })

const sender = web3.eth.accounts.privateKeyToAccount(`0x${SIDE_PRIVATE_KEY}`).address

async function main() {
  const SIDE_CHAIN_ID = await web3.eth.net.getId()

  const to = process.argv[2]
  const amount = parseFloat(process.argv[3])

  console.log(`Transfer from ${sender} to ${to}, ${amount} eth`)

  const txCoins = {
    data: '0x',
    from: sender,
    to,
    nonce: await web3.eth.getTransactionCount(sender),
    chainId: SIDE_CHAIN_ID,
    value: web3.utils.toWei(new BN(amount).toString(), 'ether'),
    gas: 21000
  }
  const signedTx = await web3.eth.accounts.signTransaction(txCoins, SIDE_PRIVATE_KEY)

  const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
  console.log(`txHash: ${receipt.transactionHash}`)
}

main()
