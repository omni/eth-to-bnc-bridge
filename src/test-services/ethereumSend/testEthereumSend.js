const ethers = require('ethers')

const {
  HOME_RPC_URL, HOME_BRIDGE_ADDRESS, HOME_PRIVATE_KEY, HOME_TOKEN_ADDRESS
} = process.env

const tokenAbi = [
  'function transfer(address to, uint256 value)',
  'function approve(address to, uint256 value)'
]
const bridgeAbi = [
  'function exchange(uint96 value)'
]

const PRIVATE_KEY = process.env.PRIVATE_KEY || HOME_PRIVATE_KEY

const provider = new ethers.providers.JsonRpcProvider(HOME_RPC_URL)
const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
const token = new ethers.Contract(HOME_TOKEN_ADDRESS, tokenAbi, wallet)
const bridge = new ethers.Contract(HOME_BRIDGE_ADDRESS, bridgeAbi, wallet)

const sender = wallet.address

async function main() {
  const to = process.argv[2]

  const amount = process.argv[3]
  const native = process.argv[4]

  if (to === 'bridge' && amount !== '0') {
    console.log(`Transfer from ${sender} to ${HOME_BRIDGE_ADDRESS}, ${amount} tokens`)

    const txApprove = await token.approve(HOME_BRIDGE_ADDRESS, ethers.utils.parseEther(amount))
    const receiptApprove = await txApprove.wait()
    console.log(`txHash approve: ${receiptApprove.transactionHash}`)

    const txExchange = await bridge.exchange(ethers.utils.parseEther(amount))
    const receiptExchange = await txExchange.wait()
    console.log(`txHash exchange: ${receiptExchange.transactionHash}`)
  } else if (amount !== '0') {
    console.log(`Transfer from ${sender} to ${to}, ${amount} tokens`)

    const tx = await token.transfer(to, ethers.utils.parseEther(amount))
    const receipt = await tx.wait()
    console.log(`txHash transfer: ${receipt.transactionHash}`)
  }

  if (native) {
    console.log(`Transfer from ${sender} to ${to}, ${native} coins`)

    const tx = await wallet.sendTransaction({
      to,
      value: ethers.utils.parseEther(native)
    })

    const receipt = await tx.wait()
    console.log(`txHash: ${receipt.transactionHash}`)
  }
}

main()
