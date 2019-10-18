const crypto = require('crypto')
const bech32 = require('bech32')

function publicKeyToAddress ({ x, y }) {
  const compact = (parseInt(y[y.length - 1], 16) % 2 ? '03' : '02') + padZeros(x, 64)
  const sha256Hash = sha256(Buffer.from(compact, 'hex'))
  const hash = ripemd160(Buffer.from(sha256Hash, 'hex'))
  const words = bech32.toWords(Buffer.from(hash, 'hex'))
  return bech32.encode('tbnb', words)
}

function padZeros (s, len) {
  while (s.length < len)
    s = '0' + s
  return s
}

function sha256 (bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function ripemd160 (bytes) {
  return crypto.createHash('ripemd160').update(bytes).digest('hex')
}

module.exports = { publicKeyToAddress, padZeros, sha256 }
