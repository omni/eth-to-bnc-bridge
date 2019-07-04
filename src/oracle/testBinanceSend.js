const Bnc = require('@binance-chain/javascript-sdk')
const axios = require('axios')
const Transaction = require('../oracle/tss-sign/tx')
const crypto = require('crypto')
const ecc = require('tiny-secp256k1')

const privKey = 'b92a59209e28149e5cee8e54dfceb80a08ea08e654261bdb9d264b15dee2525c'
const asset = 'BNB'
const amount = 2.5
const addressTo = process.argv[2]
const addressFrom = Bnc.crypto.getAddressFromPrivateKey(privKey)
const message = 'A note to you'
const api = 'https://testnet-dex.binance.org/'



const httpClient = axios.create({ baseURL: api })
httpClient
  .get(`/api/v1/account/${addressFrom}`)
  .then((res) => {
    const { sequence } = res.data
    const tx = new Transaction('tbnb1h3nmmqukrtjc0prmtdts0kxlgmw8rend4zfasn', 674629, sequence, process.argv[2], amount, 'BNB', 'test')
    const hash = crypto.createHash('sha256').update(tx.getSignBytes()).digest('hex')
    console.log(tx.getSignBytes().toString('hex'))
    console.log(hash)
    const signature = ecc.sign(Buffer.from(hash, 'hex'), Buffer.from('b92a59209e28149e5cee8e54dfceb80a08ea08e654261bdb9d264b15dee2525c', 'hex'))
    const sig = {
      r: signature.toString('hex').substr(0, 64),
      s: signature.toString('hex').substr(64, 64)
    }
    console.log(sig)
    const publicKey = {
      x: 'b32b5ea8698156239ea7092ef8a44a4b711ea29525da34a8233bdc0dd3af7f1a',
      y: '6b5b77f2e925f93cae7fc894ff50bafcb7b6e6e96e339c96e41663ccaf0a4d68'
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
