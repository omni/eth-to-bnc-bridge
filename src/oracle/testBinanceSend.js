require('dotenv').config()

const Bnc = require('@binance-chain/javascript-sdk')
const axios = require('axios')
const Transaction = require('./tss-sign/tx')
const crypto = require('crypto')
const ecc = require('tiny-secp256k1')
const utils = require('ethers').utils

const privKey = process.argv[2]//'b92a59209e28149e5cee8e54dfceb80a08ea08e654261bdb9d264b15dee2525c'
const asset = 'BNB'
const amount = process.argv[4]//'2.5'
const addressTo = process.argv[3]
const addressFrom = Bnc.crypto.getAddressFromPrivateKey(privKey)
const message = process.argv[5] || 'funding'
const api = 'https://testnet-dex.binance.org/'
const publicKeyStr = utils.computePublicKey(`0x${privKey}`)
const publicKey = {
  x: publicKeyStr.substr(4, 64),
  y: publicKeyStr.substr(68, 64)
}

console.log(`From ${addressFrom} to ${addressTo}, ${amount} tokens, memo '${message}'`)
const httpClient = axios.create({ baseURL: api })
httpClient
  .get(`/api/v1/account/${addressFrom}`)
  .then((res) => {
    const { sequence, account_number } = res.data
    const tx = new Transaction(addressFrom, account_number, sequence, addressTo, amount, asset, message)
    const hash = crypto.createHash('sha256').update(tx.getSignBytes()).digest('hex')
    const signature = ecc.sign(Buffer.from(hash, 'hex'), Buffer.from(privKey, 'hex'))
    const sig = {
      r: signature.toString('hex').substr(0, 64),
      s: signature.toString('hex').substr(64, 64)
    }

    return tx.addSignature(publicKey, sig)
  })
  .then(signed => {
    console.log('sending')
    return httpClient.post(`/api/v1/broadcast?sync=true`, signed, {
      headers: {
        'content-type': 'text/plain'
      }
    })
  })
  .then((result) => {
    if (result.status === 200) {
      console.log('success', result.data)
    } else {
      console.error('error', result)
    }
  })
  .catch((error) => {
    console.error('error', error)
  })
