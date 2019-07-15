require('dotenv').config()

const Bnc = require('@binance-chain/javascript-sdk')
const axios = require('axios')
const Transaction = require('./tss-sign/tx')
const crypto = require('crypto')
const ecc = require('tiny-secp256k1')
const utils = require('ethers').utils

const { FOREIGN_URL, FOREIGN_ASSET, FOREIGN_PRIVATE_KEY } = process.env
const amount = process.argv[3]
const addressTo = process.argv[2]
const addressFrom = Bnc.crypto.getAddressFromPrivateKey(FOREIGN_PRIVATE_KEY)
const bnbs = process.argv[4]
const realBnbs = bnbs || '0'
const publicKeyStr = utils.computePublicKey(`0x${FOREIGN_PRIVATE_KEY}`)
const publicKey = {
  x: publicKeyStr.substr(4, 64),
  y: publicKeyStr.substr(68, 64)
}

if (bnbs)
  console.log(`Funding from ${addressFrom} to ${addressTo}, ${amount} tokens, ${realBnbs} BNB'`)
else
  console.log(`From ${addressFrom} to ${addressTo}, ${amount} tokens'`)
const httpClient = axios.create({ baseURL: FOREIGN_URL })
httpClient
  .get(`/api/v1/account/${addressFrom}`)
  .then((res) => {
    const { sequence, account_number } = res.data
    const tx = new Transaction({
      from: addressFrom,
      to: addressTo,
      accountNumber: account_number,
      sequence,
      tokens: amount,
      asset: FOREIGN_ASSET,
      bnbs: realBnbs,
      memo: bnbs ? 'funding' : 'exchange'
    })
    const hash = crypto.createHash('sha256').update(tx.getSignBytes()).digest('hex')
    const signature = ecc.sign(Buffer.from(hash, 'hex'), Buffer.from(FOREIGN_PRIVATE_KEY, 'hex'))
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
