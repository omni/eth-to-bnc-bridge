const BN = require('bn.js')

function parseBuffer (buffer, base = 10) {
  return new BN(buffer).toString(base)
}

const keygenDecoders = [
  null,
  // round 1
  function (value) {
    const res = {
      e: {
        n: parseBuffer(value.slice(0, 256))
      },
      com: parseBuffer(value.slice(256, 256 + 32), 16),
      correct_key_proof: {
        sigma_vec: []
      }
    }
    for (let i = 256 + 32; i < value.length; i += 256) {
      res.correct_key_proof.sigma_vec.push(parseBuffer(value.slice(i, i + 256)))
    }
    return JSON.stringify(res)
  },
  // round 2
  function (value) {
    const res = {
      blind_factor: parseBuffer(value.slice(0, 32), 16),
      y_i: {
        x: parseBuffer(value.slice(32, 64), 16),
        y: parseBuffer(value.slice(64, 96), 16)
      }
    }
    return JSON.stringify(res)
  },
  // round 3
  function (value) {
    const res = {
      ciphertext: [],
      tag: []
    }
    for (let i = 0; i < 32; i++) {
      res.ciphertext.push(value[i])
    }
    for (let i = 32; i < 48; i++) {
      res.tag.push(value[i])
    }
    return JSON.stringify(res)
  },
  // round 4
  function (value) {
    const res = {
      parameters: {
        threshold: value[0],
        share_count: value[1]
      },
      commitments: []
    }
    for (let i = 2; i < value.length; i += 64) {
      res.commitments.push({
        x: parseBuffer(value.slice(i, i + 32), 16),
        y: parseBuffer(value.slice(i + 32, i + 64), 16),
      })
    }
    return JSON.stringify(res)
  },
  // round 5
  function (value) {
    const res = {
      pk: {
        x: parseBuffer(value.slice(0, 32), 16),
        y: parseBuffer(value.slice(32, 64), 16)
      },
      pk_t_rand_commitment: {
        x: parseBuffer(value.slice(64, 96), 16),
        y: parseBuffer(value.slice(96, 128), 16)
      },
      challenge_response: parseBuffer(value.slice(128, 160), 16)
    }
    return JSON.stringify(res)
  }
]

const signDecoders = []

module.exports = function (isKeygen, round, value) {
  value = Buffer.from(value.substr(2), 'hex')
  const roundNumber = parseInt(round[round.length - 1])
  const decoder = (isKeygen ? keygenDecoders : signDecoders)[roundNumber]
  const decoded = decoder(value)
  console.log(decoded)
  return decoded
}


