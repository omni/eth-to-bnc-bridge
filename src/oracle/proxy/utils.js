const { padZeros } = require('../shared/crypto')

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

function Ok(data) {
  return { Ok: data }
}

function Err(data) {
  return { Err: data }
}

function decodeState(state) {
  switch (state) {
    case 0:
      return 'ready'
    case 1:
      return 'closing_epoch'
    case 2:
      return 'voting'
    case 3:
      return 'keygen'
    case 4:
      return 'funds_transfer'
    default:
      return 'unknown_state'
  }
}

function encodeParam(param) {
  switch (typeof param) {
    case 'string':
      if (param.startsWith('0x')) {
        return Buffer.from(param.slice(2), 'hex')
      }
      return Buffer.from(param, 'hex')
    case 'number':
      return Buffer.from(padZeros(param.toString(16), 4), 'hex')
    case 'boolean':
      return Buffer.from([param ? 1 : 0])
    default:
      return null
  }
}

module.exports = {
  Ok,
  Err,
  decodeState,
  encodeParam,
  Action
}
