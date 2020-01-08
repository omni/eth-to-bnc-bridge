const crypto = require('crypto')
const bech32 = require('bech32')

function padZeros(s, len) {
  while (s.length < len) {
    // eslint-disable-next-line no-param-reassign
    s = `0${s}`
  }
  return s
}

function sha256(bytes) {
  return crypto.createHash('sha256')
    .update(bytes)
    .digest('hex')
}

function ripemd160(bytes) {
  return crypto.createHash('ripemd160')
    .update(bytes)
    .digest('hex')
}

function publicKeyToHexAddress({ x, y }) {
  const compact = (parseInt(y[y.length - 1], 16) % 2 ? '03' : '02') + padZeros(x, 64)
  const sha256Hash = sha256(Buffer.from(compact, 'hex'))
  return ripemd160(Buffer.from(sha256Hash, 'hex'))
}

function stripHex(s) {
  return s.startsWith('0x') ? s.substr(2) : s
}

function hexAddressToBncAddress(hexAddress) {
  const addressBytes = Buffer.from(stripHex(hexAddress), 'hex')
  const words = bech32.toWords(addressBytes)
  return bech32.encode('tbnb', words)
}

function publicKeyToAddress(publicKey) {
  const hexAddress = publicKeyToHexAddress(publicKey)
  return hexAddressToBncAddress(hexAddress)
}

module.exports = {
  publicKeyToAddress,
  padZeros,
  sha256,
  publicKeyToHexAddress,
  hexAddressToBncAddress
}
