const BN = require('bignumber.js')

function padZeros (s, len) {
  while (s.length < len)
    s = '0' + s
  return s
}

function makeBuffer (value, length = 32, base = 16) {
  return Buffer.from(padZeros(new BN(value, base).toString(16), length * 2), 'hex')
}

const keygenEncoders = [
  null,
  // round 1
  function * (value) {
    yield makeBuffer(value.e.n, 256, 10)
    yield makeBuffer(value.com)
    for (let x of value.correct_key_proof.sigma_vec) {
      yield makeBuffer(x, 256, 10)
    }
  },
  // round 2
  function * (value) {
    yield makeBuffer(value.blind_factor)
    yield makeBuffer(value.y_i.x)
    yield makeBuffer(value.y_i.y)
  },
  // round 3
  function * (value) {
    yield Buffer.from(value.ciphertext) // 32 bytes
    yield Buffer.from(value.tag) // 16 bytes
  },
  // round 4
  function * (value) {
    yield Buffer.from([ value.parameters.threshold ]) // 1 byte
    yield Buffer.from([ value.parameters.share_count ]) // 1 byte
    for (let x of value.commitments) {
      yield makeBuffer(x.x)
      yield makeBuffer(x.y)
    }
  },
  // round 5
  function * (value) {
    yield makeBuffer(value.pk.x)
    yield makeBuffer(value.pk.y)
    yield makeBuffer(value.pk_t_rand_commitment.x)
    yield makeBuffer(value.pk_t_rand_commitment.y)
    yield makeBuffer(value.challenge_response)
  }
]

const signEncoders = [
  // round 0
  function * (value) {
    yield Buffer.from([ value ])
  },
  // round 1
  function * (value) {
    yield makeBuffer(value[0].com)
    yield makeBuffer(value[1].c, 512)
  },
  // round 2
  function * (value) {
    for (let i = 0; i < 2; i++) {
      yield makeBuffer(value[i].c, 512)
      yield makeBuffer(value[i].b_proof.pk.x)
      yield makeBuffer(value[i].b_proof.pk.y)
      yield makeBuffer(value[i].b_proof.pk_t_rand_commitment.x)
      yield makeBuffer(value[i].b_proof.pk_t_rand_commitment.y)
      yield makeBuffer(value[i].b_proof.challenge_response)
      yield makeBuffer(value[i].beta_tag_proof.pk.x)
      yield makeBuffer(value[i].beta_tag_proof.pk.y)
      yield makeBuffer(value[i].beta_tag_proof.pk_t_rand_commitment.x)
      yield makeBuffer(value[i].beta_tag_proof.pk_t_rand_commitment.y)
      yield makeBuffer(value[i].beta_tag_proof.challenge_response)
    }
  },
  // round 3
  function * (value) {
    yield makeBuffer(value)
  },
  // round 4
  function * (value) {
    yield makeBuffer(value.blind_factor)
    yield makeBuffer(value.g_gamma_i.x)
    yield makeBuffer(value.g_gamma_i.y)
  },
  // round 5
  function * (value) {
    yield makeBuffer(value.com)
  },
  // round 6
  function * (value) {
    yield makeBuffer(value[0].V_i.x)
    yield makeBuffer(value[0].V_i.y)
    yield makeBuffer(value[0].A_i.x)
    yield makeBuffer(value[0].A_i.y)
    yield makeBuffer(value[0].B_i.x)
    yield makeBuffer(value[0].B_i.y)
    yield makeBuffer(value[0].blind_factor)
    yield makeBuffer(value[1].T.x)
    yield makeBuffer(value[1].T.y)
    yield makeBuffer(value[1].A3.x)
    yield makeBuffer(value[1].A3.y)
    yield makeBuffer(value[1].z1)
    yield makeBuffer(value[1].z2)
  },
  // round 7
  function * (value) {
    yield makeBuffer(value.com)
  },
  // round 8
  function * (value) {
    yield makeBuffer(value.u_i.x)
    yield makeBuffer(value.u_i.y)
    yield makeBuffer(value.t_i.x)
    yield makeBuffer(value.t_i.y)
    yield makeBuffer(value.blind_factor)
  },
  // round 9
  function * (value) {
    yield makeBuffer(value)
  },
]

module.exports = function (isKeygen, round, value) {
  const parsedValue = JSON.parse(value)
  const roundNumber = parseInt(round[round.length - 1])
  const encoder = (isKeygen ? keygenEncoders : signEncoders)[roundNumber]
  const generator = encoder(parsedValue)
  const buffers = []
  let next
  while (true) {
    next = generator.next()
    if (next.done)
      break
    buffers.push(next.value)
  }
  const encoded = Buffer.concat(buffers)
  console.log(`Raw data: ${value.length} bytes, encoded data: ${encoded.length} bytes`)
  return encoded
}


module.exports(true, 'round2', '{"blind_factor":"11223344556677889900", "y_i":{"x":"00112233445566778899", "y":"00112233445566778899"}}')

