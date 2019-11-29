const { padZeros } = require('../shared/crypto')

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

function Ok(data) {
  return { Ok: data }
}

function Err(data) {
  return { Err: data }
}

function decodeStatus(status) {
  switch (status) {
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
  decodeStatus,
  encodeParam,
  Action
}
