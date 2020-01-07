const ethers = require('ethers')

const {
  HOME_RPC_URL, HOME_BRIDGE_ADDRESS, WITH_SIGNATURES, SIDE_RPC_URL, SIDE_SHARED_DB_ADDRESS
} = process.env
const HOME_START_BLOCK = parseInt(process.env.HOME_START_BLOCK, 10)
const START_BLOCK = parseInt(process.env.START_BLOCK, 10)
const EPOCH = parseInt(process.env.EPOCH, 10)

const bridgeAbi = [
  'event AppliedMessage(bytes message)',
  'function getValidators(uint16 epoch) view returns (address[])'
]
const sharedDbAbi = [
  'function getSignatures(bytes32 msgHash, address[] validators) view returns (bytes)'
]

const Action = {
  CONFIRM_KEYGEN: 0,
  CONFIRM_FUNDS_TRANSFER: 1,
  CONFIRM_CLOSE_EPOCH: 2,
  START_VOTING: 3,
  ADD_VALIDATOR: 4,
  REMOVE_VALIDATOR: 5,
  CHANGE_THRESHOLD: 6,
  CHANGE_CLOSE_EPOCH: 7,
  START_KEYGEN: 8,
  CANCEL_KEYGEN: 9,
  TRANSFER: 10,
  CHANGE_MIN_PER_TX_LIMIT: 11,
  CHANGE_MAX_PER_TX_LIMIT: 12,
  INCREASE_EXECUTION_MAX_TX_LIMIT: 13,
  DECREASE_EXECUTION_MIN_TX_LIMIT: 14,
  CHANGE_RANGE_SIZE: 15
}

const actionNames = [
  'CONFIRM_KEYGEN',
  'CONFIRM_FUNDS_TRANSFER',
  'CONFIRM_CLOSE_EPOCH',
  'START_VOTING',
  'ADD_VALIDATOR',
  'REMOVE_VALIDATOR',
  'CHANGE_THRESHOLD',
  'CHANGE_RANGE_SIZE',
  'CHANGE_CLOSE_EPOCH',
  'START_KEYGEN',
  'CANCEL_KEYGEN',
  'TRANSFER'
]

let bridge
let sharedDb

function processEvent(event) {
  const { message } = event.values

  const type = parseInt(message.slice(2, 4), 16)
  const epoch = parseInt(message.slice(4, 8), 16)
  const baseMsg = {
    type: actionNames[type],
    blockNumber: event.blockNumber,
    epoch
  }

  switch (type) {
    case Action.CONFIRM_KEYGEN:
      return {
        ...baseMsg,
        x: message.slice(8, 72),
        y: message.slice(72, 136)
      }
    case Action.CONFIRM_FUNDS_TRANSFER:
    case Action.CONFIRM_CLOSE_EPOCH:
    case Action.START_VOTING:
      return baseMsg
    case Action.ADD_VALIDATOR:
    case Action.REMOVE_VALIDATOR:
      return {
        ...baseMsg,
        validator: `0x${message.slice(8, 48)}`,
        attempt: parseInt(message.slice(48, 66), 16)
      }
    case Action.CHANGE_THRESHOLD:
      return {
        ...baseMsg,
        threshold: parseInt(message.slice(8, 12), 16),
        attempt: parseInt(message.slice(12, 66), 16)
      }
    case Action.CHANGE_RANGE_SIZE:
      return {
        ...baseMsg,
        rangeSize: parseInt(message.slice(8, 12), 16),
        attempt: parseInt(message.slice(12, 66), 16)
      }
    case Action.CHANGE_CLOSE_EPOCH:
      return {
        ...baseMsg,
        closeEpoch: parseInt(message.slice(8, 10), 16) > 0,
        attempt: parseInt(message.slice(10, 66), 16)
      }
    case Action.START_KEYGEN:
    case Action.CANCEL_KEYGEN:
      return {
        ...baseMsg,
        attempt: parseInt(message.slice(8, 66), 16)
      }
    case Action.TRANSFER:
      return {
        ...baseMsg,
        txHash: message.slice(8, 72),
        to: `0x${message.slice(72, 112)}`,
        value: `0x${message.slice(112, 136)}`
      }
    default:
      return {
        ...baseMsg,
        type: 'UNKNOWN'
      }
  }
}

const epochValidators = []

async function getEpochValidators(epoch) {
  if (!epochValidators[epoch]) {
    epochValidators[epoch] = await bridge.getValidators(epoch)
  }
  return epochValidators[epoch]
}

async function fetchSignatures(event) {
  const { message } = event.values

  const epoch = parseInt(message.slice(4, 8), 16)

  const msgHash = ethers.utils.hashMessage(Buffer.from(message.slice(2), 'hex'))

  const validators = await getEpochValidators(epoch)

  const signatures = await sharedDb.getSignatures(msgHash, validators)
  const signers = []
  for (let i = 0; i < validators.length; i += 1) {
    const signature = signatures.slice(2 + i * 130, 132 + i * 130)
    signers.push(ethers.utils.recoverAddress(msgHash, `0x${signature}`))
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
    fromBlock: START_BLOCK || HOME_START_BLOCK,
    toBlock: 'latest',
    topics: bridge.filters.AppliedMessage().topics
  })).map((log) => ({
    ...bridge.interface.parseLog(log),
    ...log
  }))

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]
    const log = processEvent(event)
    if (!EPOCH || log.epoch === EPOCH) {
      if (WITH_SIGNATURES) {
        log.signatures = await fetchSignatures(event)
      }
      console.log(JSON.stringify(log))
    }
  }
}

main()
