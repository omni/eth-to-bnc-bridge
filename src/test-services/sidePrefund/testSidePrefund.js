const ethers = require('ethers')

const { SIDE_RPC_URL, SIDE_PRIVATE_KEY } = process.env

const provider = new ethers.providers.JsonRpcProvider(SIDE_RPC_URL)
const wallet = new ethers.Wallet(SIDE_PRIVATE_KEY, provider)

const sender = wallet.address

async function main() {
  const to = process.argv[2]
  const amount = process.argv[3]

  console.log(`Transfer from ${sender} to ${to}, ${amount} eth`)

  const txCoins = {
    to,
    value: ethers.utils.parseEther(amount)
  }

  const tx = await wallet.sendTransaction(txCoins)
  const receipt = await tx.wait()
  console.log(`txHash: ${receipt.transactionHash}`)
}

main()
