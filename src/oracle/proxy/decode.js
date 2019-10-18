const BN = require('bn.js')

function Tokenizer (_buffer) {
  const buffer = _buffer
  let position = 0
  return {
    isEmpty: function () {
      return position === buffer.length
    },
    parse: function (length = 32, base = 16) {
      const res = new BN(buffer.slice(position, position + length)).toString(base)
      position += length
      return res
    },
    byte: function () {
      return buffer[position++]
    }
  }
}

const keygenDecoders = [
  null,
  // round 1
  function (tokenizer) {
    const res = {
      e: {
        n: tokenizer.parse(256, 10)
      },
      com: tokenizer.parse(),
      correct_key_proof: {
        sigma_vec: []
      }
    }
    while (!tokenizer.isEmpty()) {
      res.correct_key_proof.sigma_vec.push(tokenizer.parse(256, 10))
    }
    return res
  },
  // round 2
  function (tokenizer) {
    return {
      blind_factor: tokenizer.parse(),
      y_i: {
        x: tokenizer.parse(),
        y: tokenizer.parse()
      }
    }
  },
  // round 3
  function (tokenizer) {
    const res = {
      ciphertext: [],
      tag: []
    }
    for (let i = 0; i < 32; i++) {
      res.ciphertext.push(tokenizer.byte())
    }
    for (let i = 0; i < 16; i++) {
      res.tag.push(tokenizer.byte())
    }
    return res
  },
  // round 4
  function (tokenizer) {
    const res = {
      parameters: {
        threshold: tokenizer.byte(),
        share_count: tokenizer.byte()
      },
      commitments: []
    }
    while (!tokenizer.isEmpty()) {
      res.commitments.push({
        x: tokenizer.parse(),
        y: tokenizer.parse(),
      })
    }
    return res
  },
  // round 5
  function (tokenizer) {
    return {
      pk: {
        x: tokenizer.parse(),
        y: tokenizer.parse()
      },
      pk_t_rand_commitment: {
        x: tokenizer.parse(),
        y: tokenizer.parse()
      },
      challenge_response: tokenizer.parse()
    }
  }
]

const signDecoders = [
  // round 0
  function (tokenizer) {
    return tokenizer.byte()
  },
  // round 1
  function (tokenizer) {
    return [
      {
        com: tokenizer.parse()
      },
      {
        c: tokenizer.parse(512)
      }
    ]
  },
  // round 2
  function (tokenizer) {
    const res = []
    for (let i = 0; i < 2; i++) {
      res[i] = {
        c: tokenizer.parse(512),
        b_proof: {
          pk: {
            x: tokenizer.parse(),
            y: tokenizer.parse(),
          },
          pk_t_rand_commitment: {
            x: tokenizer.parse(),
            y: tokenizer.parse(),
          },
          challenge_response: tokenizer.parse(),
        },
        beta_tag_proof: {
          pk: {
            x: tokenizer.parse(),
            y: tokenizer.parse(),
          },
          pk_t_rand_commitment: {
            x: tokenizer.parse(),
            y: tokenizer.parse(),
          },
          challenge_response: tokenizer.parse(),
        }
      }
    }
    return res
  },
  // round 3
  function (tokenizer) {
    return tokenizer.parse()
  },
  // round 4
  function (tokenizer) {
    return {
      blind_factor: tokenizer.parse(),
      g_gamma_i: {
        x: tokenizer.parse(),
        y: tokenizer.parse()
      }
    }
  },
  // round 5
  function (tokenizer) {
    return {
      com: tokenizer.parse()
    }
  },
  // round 6
  function (tokenizer) {
    return [
      {
        V_i: {
          x: tokenizer.parse(),
          y: tokenizer.parse()
        },
        A_i: {
          x: tokenizer.parse(),
          y: tokenizer.parse()
        },
        B_i: {
          x: tokenizer.parse(),
          y: tokenizer.parse()
        },
        blind_factor: tokenizer.parse()
      },
      {
        T: {
          x: tokenizer.parse(),
          y: tokenizer.parse()
        },
        A3: {
          x: tokenizer.parse(),
          y: tokenizer.parse()
        },
        z1: tokenizer.parse(),
        z2: tokenizer.parse()
      }
    ]
  },
  // round 7
  function (tokenizer) {
    return {
      com: tokenizer.parse()
    }
  },
  // round 8
  function (tokenizer) {
    return {
      u_i: {
        x: tokenizer.parse(),
        y: tokenizer.parse()
      },
      t_i: {
        x: tokenizer.parse(),
        y: tokenizer.parse()
      },
      blind_factor: tokenizer.parse()
    }
  },
  // round 9
  function (tokenizer) {
    return tokenizer.parse()
  },
]

module.exports = function (isKeygen, round, value) {
  value = Buffer.from(value.substr(2), 'hex')
  const tokenizer = Tokenizer(value)
  const roundNumber = parseInt(round[round.length - 1])
  const decoder = (isKeygen ? keygenDecoders : signDecoders)[roundNumber]
  return JSON.stringify(decoder(tokenizer))
}
