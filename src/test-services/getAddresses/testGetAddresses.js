const { utils } = require('ethers')
const bech32 = require('bech32')
const crypto = require('crypto')

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function ripemd160(bytes) {
  return crypto.createHash('ripemd160').update(bytes).digest('hex')
}

function publicKeyToAddress(publicKey) {
  const sha256Hash = sha256(Buffer.from(publicKey.substr(2), 'hex'))
  const hash = ripemd160(Buffer.from(sha256Hash, 'hex'))
  const words = bech32.toWords(Buffer.from(hash, 'hex'))
  return bech32.encode('tbnb', words)
}

function main() {
  const privateKey = process.argv[2].startsWith('0x') ? process.argv[2] : `0x${process.argv[2]}`

  const ethAddress = utils.computeAddress(privateKey)
  const publicKey = utils.computePublicKey(privateKey, true)

  console.log(`Eth address: ${ethAddress}\nBnc address: ${publicKeyToAddress(publicKey)}`)
}

main()
