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

module.exports = {
  Ok,
  Err,
  decodeStatus
}
