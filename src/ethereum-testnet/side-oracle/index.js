const ethers = require('ethers')

const {
  HOME_PRIVATE_KEY, HOME_RPC_URL, HOME_BRIDGE_ADDRESS, SIDE_RPC_URL, SIDE_SHARED_DB_ADDRESS
} = process.env
const SIDE_MAX_FETCH_RANGE_SIZE = parseInt(process.env.SIDE_MAX_FETCH_RANGE_SIZE, 10)

const bridgeAbi = [
  'function applyMessage(bytes message, bytes signatures)',
  'function getThreshold(uint epoch) view returns (uint)',
  'function getValidatorsInEpoch(uint epoch) view returns (address[])'
]
const sharedDbAbi = [
  'event NewMessage(bytes32 msgHash)',
  'function getSignatures(bytes32 msgHash, address[] validators) view returns (bytes)'
]

let homeProvider
let sideProvider
let bridge
let sharedDb
let homeWallet
let nonce
let blockNumber = 0

async function delay(ms) {
  await new Promise((res) => setTimeout(res, ms))
}

async function handleNewMessage(event) {
  const { msgHash } = event.values
  const message = (await sharedDb.signedMessages(msgHash))[0]
  const epoch = parseInt(message.slice(30, 3).toString('hex'), 16)
  const [threshold, validators] = await Promise.all([
    bridge.getThreshold(epoch),
    bridge.getValidatorsInEpoch(epoch)
  ])

  while (true) {
    const signatures = await sharedDb.getSignatures(msgHash, validators)
    if (signatures.length / 65 >= threshold) {
      const tx = await bridge.applyMessage(message, signatures, {
        gasLimit: 1000000,
        nonce
      })
      await tx.wait()
      nonce += 1
      break
    }
  }
}

async function initialize() {
  await delay(5000)
  sideProvider = new ethers.providers.JsonRpcProvider(SIDE_RPC_URL)
  homeProvider = new ethers.providers.JsonRpcProvider(HOME_RPC_URL)
  bridge = new ethers.Contract(HOME_BRIDGE_ADDRESS, bridgeAbi, homeProvider)
  sharedDb = new ethers.Contract(SIDE_SHARED_DB_ADDRESS, sharedDbAbi, sideProvider)

  homeWallet = new ethers.Wallet(HOME_PRIVATE_KEY, homeProvider)

  nonce = await homeWallet.getTransactionCount()
}

async function loop() {
  const latestBlockNumber = await sideProvider.getBlockNumber()
  if (latestBlockNumber < blockNumber) {
    console.log(`No block after ${latestBlockNumber}`)
    return
  }

  const endBlock = Math.min(latestBlockNumber, blockNumber + SIDE_MAX_FETCH_RANGE_SIZE - 1)

  console.log(`Watching events in blocks #${blockNumber}-${endBlock}`)

  const bridgeEvents = (await sideProvider.getLogs({
    address: SIDE_SHARED_DB_ADDRESS,
    fromBlock: blockNumber,
    toBlock: endBlock,
    topics: []
  }))

  for (let i = 0; i < bridgeEvents.length; i += 1) {
    const event = bridge.interface.parseLog(bridgeEvents[i])
    console.log('Consumed event', event, bridgeEvents[i])
    switch (event.name) {
      case 'NewMessage':
        await handleNewMessage(event)
        break
      default:
        console.log('Unknown event %o', event)
    }
  }

  blockNumber = endBlock + 1
}

async function main() {
  await initialize()

  while (true) {
    await delay(2000)
    await loop()
  }
}

main()
