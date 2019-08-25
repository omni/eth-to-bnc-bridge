const BN = require('bignumber.js')

function padZeros (s, len) {
  while (s.length < len)
    s = '0' + s
  return s
}

function makeBuffer (value, length, base = 10) {
  return Buffer.from(padZeros(new BN(value, base).toString(16), length * 2), 'hex')
}

const keygenEncoders = [
  null,
  // round 1
  function (value) {
    const buffers = []
    buffers.push(makeBuffer(value.e.n, 256))
    buffers.push(makeBuffer(value.com, 32, 16))
    for (let x of value.correct_key_proof.sigma_vec) {
      buffers.push(makeBuffer(x, 256))
    }
    return Buffer.concat(buffers)
  },
  // round 2
  function (value) {
    const buffers = []
    buffers.push(makeBuffer(value.blind_factor, 32, 16))
    buffers.push(makeBuffer(value.y_i.x, 32, 16))
    buffers.push(makeBuffer(value.y_i.y, 32, 16))
    return Buffer.concat(buffers)
  },
  // round 3
  function (value) {
    const buffers = []
    buffers.push(Buffer.from(value.ciphertext)) // 32 bytes
    buffers.push(Buffer.from(value.tag)) // 16 bytes
    return Buffer.concat(buffers)
  },
  // round 4
  function (value) {
    const buffers = []
    buffers.push(Buffer.from([ value.parameters.threshold ])) // 1 byte
    buffers.push(Buffer.from([ value.parameters.share_count ])) // 1 byte
    for (let x of value.commitments) {
      buffers.push(makeBuffer(x.x, 32, 16))
      buffers.push(makeBuffer(x.y, 32, 16))
    }
    return Buffer.concat(buffers)
  },
  // round 5
  function (value) {
    const buffers = []
    buffers.push(makeBuffer(value.pk.x, 32, 16))
    buffers.push(makeBuffer(value.pk.y, 32, 16))
    buffers.push(makeBuffer(value.pk_t_rand_commitment.x, 32, 16))
    buffers.push(makeBuffer(value.pk_t_rand_commitment.y, 32, 16))
    buffers.push(makeBuffer(value.challenge_response, 32, 16))
    return Buffer.concat(buffers)
  }
]

const signEncoders = []

module.exports = function (isKeygen, round, value) {
  const parsedValue = JSON.parse(value)
  const roundNumber = parseInt(round[round.length - 1])
  const encoder = (isKeygen ? keygenEncoders : signEncoders)[roundNumber]
  const encoded = encoder(parsedValue)
  console.log(`Raw data: ${value.length} bytes, encoded data: ${encoded.length} bytes`)
  return encoded
}


