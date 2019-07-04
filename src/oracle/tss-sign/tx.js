const TransactionBnc = require('@binance-chain/javascript-sdk/lib/tx').default
const { crypto } = require('@binance-chain/javascript-sdk')
const BN = require('bn.js')

const { FOREIGN_CHAIN_ID } = process.env

class Transaction {
  constructor (fromAddress, accountNumber, sequence, toAddress, amount, asset, memo = 'test') {
    const accCode = crypto.decodeAddress(fromAddress)
    const toAccCode = crypto.decodeAddress(toAddress)

    amount *= 10 ** 8

    const coin = {
      denom: asset,
      amount: amount,
    }

    const msg = {
      inputs: [{
        address: accCode,
        coins: [coin]
      }],
      outputs: [{
        address: toAccCode,
        coins: [coin]
      }],
      msgType: 'MsgSend'
    }

    this.signMsg = {
      inputs: [{
        address: fromAddress,
        coins: [{
          amount: amount,
          denom: asset
        }]
      }],
      outputs: [{
        address: toAddress,
        coins: [{
          amount: amount,
          denom: asset
        }]
      }]
    }

    const options = {
      account_number: accountNumber,
      chain_id: FOREIGN_CHAIN_ID,
      memo: memo,
      msg,
      sequence,
      type: msg.msgType,
    }
    this.tx = new TransactionBnc(options)
  }

  getSignBytes () {
    return this.tx.getSignBytes(this.signMsg)
  }

  addSignature (publicKey, signature) {
    const yLast = parseInt(publicKey.y[publicKey.y.length - 1], 16)
    const n = new BN('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141', 16)
    const s = new BN(signature.s, 16)
    if (s.gt(n.divn(2))) {
      console.log('Normalizing s')
      signature.s = n.sub(s).toString(16)
    }
    const publicKeyEncoded = Buffer.from('eb5ae98721' + (yLast % 2 ? '03' : '02') + padZeros(publicKey.x, 64), 'hex')
    this.tx.signatures = [{
      pub_key: publicKeyEncoded,
      signature: Buffer.from(padZeros(signature.r, 64) + padZeros(signature.s, 64), 'hex'),
      account_number: this.tx.account_number,
      sequence: this.tx.sequence,
    }]
    return this.tx.serialize()
  }
}

function padZeros (s, len) {
  while (s.length < len)
    s = '0' + s
  return s
}

module.exports = Transaction
