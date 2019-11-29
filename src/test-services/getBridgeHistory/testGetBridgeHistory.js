const ethers = require('ethers')

const {
  HOME_RPC_URL, HOME_BRIDGE_ADDRESS, WITH_SIGNATURES, SIDE_RPC_URL, SIDE_SHARED_DB_ADDRESS
} = process.env
const HOME_START_BLOCK = parseInt(process.env.HOME_START_BLOCK, 10)

const bridgeAbi = [
  'event AppliedMessage(bytes message)',
  'function getThreshold(uint16 epoch) view returns (uint16)',
  'function getValidators(uint16 epoch) view returns (address[])'
]
const sharedDbAbi = [
  'function getSignatures(bytes32 msgHash, address[] validators) view returns (bytes)'
]

const Action = {
  CONFIRM_KEYGEN: 0,
  CONFIRM_FUNDS_TRANSFER: 1,
  CONFIRM_CLOSE_EPOCH: 2,
  VOTE_START_VOTING: 3,
  VOTE_ADD_VALIDATOR: 4,
  VOTE_REMOVE_VALIDATOR: 5,
  VOTE_CHANGE_THRESHOLD: 6,
  VOTE_CHANGE_RANGE_SIZE: 7,
  VOTE_CHANGE_CLOSE_EPOCH: 8,
  VOTE_START_KEYGEN: 9,
  VOTE_CANCEL_KEYGEN: 10,
  TRANSFER: 11
}

const ActionName = {
  CONFIRM_KEYGEN: 'CONFIRM_KEYGEN',
  CONFIRM_FUNDS_TRANSFER: 'CONFIRM_FUNDS_TRANSFER',
  CONFIRM_CLOSE_EPOCH: 'CONFIRM_CLOSE_EPOCH',
  VOTE_START_VOTING: 'VOTE_START_VOTING',
  VOTE_ADD_VALIDATOR: 'VOTE_ADD_VALIDATOR',
  VOTE_REMOVE_VALIDATOR: 'VOTE_REMOVE_VALIDATOR',
  VOTE_CHANGE_THRESHOLD: 'VOTE_CHANGE_THRESHOLD',
  VOTE_CHANGE_RANGE_SIZE: 'VOTE_CHANGE_RANGE_SIZE',
  VOTE_CHANGE_CLOSE_EPOCH: 'VOTE_CHANGE_CLOSE_EPOCH',
  VOTE_START_KEYGEN: 'VOTE_START_KEYGEN',
  VOTE_CANCEL_KEYGEN: 'VOTE_CANCEL_KEYGEN',
  TRANSFER: 'TRANSFER',
  UNKNOWN: 'UNKNOWN'
}

let bridge
let sharedDb

function processEvent(event) {
  const { message } = event.values

  const type = parseInt(message.slice(2, 4), 16)
  const epoch = parseInt(message.slice(4, 8), 16)

  switch (type) {
    case Action.CONFIRM_KEYGEN:
      return {
        type: ActionName.CONFIRM_KEYGEN,
        epoch,
        x: message.slice(8, 72),
        y: message.slice(72, 136)
      }
    case Action.CONFIRM_FUNDS_TRANSFER:
      return {
        type: ActionName.CONFIRM_FUNDS_TRANSFER,
        epoch
      }
    case Action.CONFIRM_CLOSE_EPOCH:
      return {
        type: ActionName.CONFIRM_CLOSE_EPOCH,
        epoch
      }
    case Action.VOTE_START_VOTING:
      return {
        type: ActionName.VOTE_START_VOTING,
        epoch
      }
    case Action.VOTE_ADD_VALIDATOR:
      return {
        type: ActionName.VOTE_ADD_VALIDATOR,
        epoch,
        validator: `0x${message.slice(8, 48)}`,
        attempt: parseInt(message.slice(48, 66), 16)
      }
    case Action.VOTE_REMOVE_VALIDATOR:
      return {
        type: ActionName.VOTE_REMOVE_VALIDATOR,
        epoch,
        validator: `0x${message.slice(8, 48)}`,
        attempt: parseInt(message.slice(48, 66), 16)
      }
    case Action.VOTE_CHANGE_THRESHOLD:
      return {
        type: ActionName.VOTE_CHANGE_THRESHOLD,
        epoch,
        threshold: parseInt(message.slice(8, 12), 16),
        attempt: parseInt(message.slice(12, 66), 16)
      }
    case Action.VOTE_CHANGE_RANGE_SIZE:
      return {
        type: ActionName.VOTE_CHANGE_RANGE_SIZE,
        epoch,
        rangeSize: parseInt(message.slice(8, 12), 16),
        attempt: parseInt(message.slice(12, 66), 16)
      }
    case Action.VOTE_CHANGE_CLOSE_EPOCH:
      return {
        type: ActionName.VOTE_CHANGE_CLOSE_EPOCH,
        epoch,
        closeEpoch: parseInt(message.slice(8, 10), 16) > 0,
        attempt: parseInt(message.slice(10, 66), 16)
      }
    case Action.VOTE_START_KEYGEN:
      return {
        type: ActionName.VOTE_START_KEYGEN,
        epoch,
        attempt: parseInt(message.slice(8, 66), 16)
      }
    case Action.VOTE_CANCEL_KEYGEN:
      return {
        type: ActionName.VOTE_CANCEL_KEYGEN,
        epoch,
        attempt: parseInt(message.slice(8, 66), 16)
      }
    case Action.TRANSFER:
      return {
        type: ActionName.TRANSFER,
        epoch,
        txHash: message.slice(8, 72),
        to: `0x${message.slice(72, 112)}`,
        value: `0x${message.slice(112, 136)}`
      }
    default:
      return {
        type: ActionName.UNKNOWN
      }
  }
}

async function fetchSignatures(event) {
  const { message } = event.values

  const epoch = parseInt(message.slice(4, 8), 16)

  const msgHash = ethers.utils.hashMessage(Buffer.from(message.slice(2), 'hex'))

  const [threshold, validators] = await Promise.all([
    bridge.getThreshold(epoch),
    bridge.getValidators(epoch)
  ])

  const signatures = await sharedDb.getSignatures(msgHash, validators)
  const signers = []
  for (let i = 0; i < threshold; i += 1) {
    validators.push(signatures.slice(2 + i * 130, 132 + i * 130))
  }
  return signers
}

async function main() {
  const homeProvider = new ethers.providers.JsonRpcProvider(HOME_RPC_URL)
  const sideProvider = new ethers.providers.JsonRpcProvider(SIDE_RPC_URL)
  bridge = new ethers.Contract(HOME_BRIDGE_ADDRESS, bridgeAbi, homeProvider)
  sharedDb = new ethers.Contract(SIDE_SHARED_DB_ADDRESS, sharedDbAbi, sideProvider)

  const events = (await homeProvider.getLogs({
    address: HOME_BRIDGE_ADDRESS,
    fromBlock: HOME_START_BLOCK,
    toBlock: 'latest',
    topics: bridge.filters.AppliedMessage().topics
  })).map((log) => bridge.interface.parseLog(log))

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]
    const log = processEvent(event)
    if (WITH_SIGNATURES) {
      log.signatures = fetchSignatures(sharedDb, event)
    }
    console.log(JSON.stringify(log))
  }
}

main()
