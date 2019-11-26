const BN = require('bignumber.js')

const { padZeros } = require('./crypto')

function makeBuffer(value, length = 32, base = 16) {
  return Buffer.from(padZeros(new BN(value, base).toString(16), length * 2), 'hex')
}

const keygenEncoders = [
  null,
  // round 1
  function* g(value) {
    yield makeBuffer(value.e.n, 256, 10)
    yield makeBuffer(value.com)
    for (let i = 0; i < value.correct_key_proof.sigma_vec.length; i += 1) {
      yield makeBuffer(value.correct_key_proof.sigma_vec[i], 256, 10)
    }
  },
  // round 2
  function* g(value) {
    yield makeBuffer(value.blind_factor)
    yield makeBuffer(value.y_i.x)
    yield makeBuffer(value.y_i.y)
  },
  // round 3
  function* g(value) {
    yield Buffer.from([value.ciphertext.length])
    yield Buffer.from(value.ciphertext) // 32 bytes or less
    yield Buffer.from(value.tag) // 16 bytes or less
  },
  // round 4
  function* g(value) {
    yield Buffer.from([value.parameters.threshold]) // 1 byte
    yield Buffer.from([value.parameters.share_count]) // 1 byte
    for (let i = 0; i < value.commitments.length; i += 1) {
      const x = value.commitments[i]
      yield makeBuffer(x.x)
      yield makeBuffer(x.y)
    }
  },
  // round 5
  function* g(value) {
    yield makeBuffer(value.pk.x)
    yield makeBuffer(value.pk.y)
    yield makeBuffer(value.pk_t_rand_commitment.x)
    yield makeBuffer(value.pk_t_rand_commitment.y)
    yield makeBuffer(value.challenge_response)
  }
]

const signEncoders = [
  // round 0
  function* g(value) {
    yield Buffer.from([value])
  },
  // round 1
  function* g(value) {
    yield makeBuffer(value[0].com)
    yield makeBuffer(value[1].c, 512)
  },
  // round 2
  function* g(value) {
    for (let i = 0; i < 2; i += 1) {
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
  function* g(value) {
    yield makeBuffer(value)
  },
  // round 4
  function* g(value) {
    yield makeBuffer(value.blind_factor)
    yield makeBuffer(value.g_gamma_i.x)
    yield makeBuffer(value.g_gamma_i.y)
  },
  // round 5
  function* g(value) {
    yield makeBuffer(value.com)
  },
  // round 6
  function* g(value) {
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
  function* g(value) {
    yield makeBuffer(value.com)
  },
  // round 8
  function* g(value) {
    yield makeBuffer(value.u_i.x)
    yield makeBuffer(value.u_i.y)
    yield makeBuffer(value.t_i.x)
    yield makeBuffer(value.t_i.y)
    yield makeBuffer(value.blind_factor)
  },
  // round 9
  function* g(value) {
    yield makeBuffer(value)
  }
]

function encode(isKeygen, round, value) {
  const parsedValue = JSON.parse(value)
  const roundNumber = parseInt(round[round.length - 1], 10)
  const encoder = (isKeygen ? keygenEncoders : signEncoders)[roundNumber]
  const generator = encoder(parsedValue)
  const buffers = []
  let next = generator.next()
  while (!next.done) {
    buffers.push(next.value)
    next = generator.next()
  }
  return Buffer.concat(buffers)
}

module.exports = encode
