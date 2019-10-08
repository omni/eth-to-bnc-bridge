const TransactionBnc = require('@binance-chain/javascript-sdk/lib/tx').default
const { crypto } = require('@binance-chain/javascript-sdk')
const BN = require('bignumber.js')

const logger = require('./logger')
const { padZeros } = require('./crypto')

const { FOREIGN_CHAIN_ID } = process.env

class Transaction {
  constructor (options) {
    const { from, accountNumber, sequence, to, tokens, asset, bnbs, memo = '' } = options
    const accCode = crypto.decodeAddress(from)
    const toAccCode = crypto.decodeAddress(to)

    const coins = []

    if (tokens && tokens !== '0' && asset) {
      coins.push({
        denom: asset,
        amount: new BN(tokens).multipliedBy(10 ** 8).toNumber(),
      })
    }
    if (bnbs && bnbs !== '0') {
      coins.push({
        denom: 'BNB',
        amount: new BN(bnbs).multipliedBy(10 ** 8).toNumber(),
      })
    }

    coins.sort((a, b) => a.denom > b.denom)

    const msg = {
      inputs: [ {
        address: accCode,
        coins
      } ],
      outputs: [ {
        address: toAccCode,
        coins
      } ],
      msgType: 'MsgSend'
    }

    this.signMsg = {
      inputs: [ {
        address: from,
        coins
      } ],
      outputs: [ {
        address: to,
        coins
      } ]
    }

    this.tx = new TransactionBnc({
      account_number: accountNumber,
      chain_id: FOREIGN_CHAIN_ID,
      memo,
      msg,
      sequence,
      type: msg.msgType,
    })
  }

  getSignBytes () {
    return this.tx.getSignBytes(this.signMsg)
  }

  addSignature (publicKey, signature) {
    const yLast = parseInt(publicKey.y[publicKey.y.length - 1], 16)
    const n = new BN('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141', 16)
    const s = new BN(signature.s, 16)
    if (s.gt(n.div(2))) {
      logger.debug('Normalizing s')
      signature.s = n.minus(s).toString(16)
    }
    const publicKeyEncoded = Buffer.from('eb5ae98721' + (yLast % 2 ? '03' : '02') + padZeros(publicKey.x, 64), 'hex')
    this.tx.signatures = [ {
      pub_key: publicKeyEncoded,
      signature: Buffer.from(padZeros(signature.r, 64) + padZeros(signature.s, 64), 'hex'),
      account_number: this.tx.account_number,
      sequence: this.tx.sequence,
    } ]
    return this.tx.serialize()
  }
}

module.exports = Transaction
