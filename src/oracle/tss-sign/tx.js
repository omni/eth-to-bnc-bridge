const TransactionBnc = require('@binance-chain/javascript-sdk/lib/tx').default
const { crypto } = require('@binance-chain/javascript-sdk')
const BN = require('bignumber.js')

const logger = require('./logger')
const { padZeros } = require('./crypto')

const { FOREIGN_CHAIN_ID } = process.env

const BNB_ASSET = 'BNB'

class Transaction {
  constructor(options) {
    const {
      from, accountNumber, sequence, recipients, asset, memo = '', flags
    } = options

    let msg
    if (flags) {
      msg = {
        from: crypto.decodeAddress(from),
        flags,
        msgType: 'NewOrderMsg' // until 'SetAccountFlagsMsg' is not available
      }

      this.signMsg = {
        flags,
        from
      }
    } else {
      const totalTokens = recipients.reduce(
        (sum, { tokens }) => sum.plus(new BN(tokens || 0)), new BN(0)
      )
      const totalBnbs = recipients.reduce(
        (sum, { bnbs }) => sum.plus(new BN(bnbs || 0)), new BN(0)
      )
      const senderCoins = []
      if (asset && totalTokens.isGreaterThan(0)) {
        senderCoins.push({
          denom: asset,
          amount: totalTokens.multipliedBy(10 ** 8).toNumber()
        })
      }
      if (totalBnbs.isGreaterThan(0)) {
        senderCoins.push({
          denom: BNB_ASSET,
          amount: totalBnbs.multipliedBy(10 ** 8).toNumber()
        })
      }
      senderCoins.sort((a, b) => a.denom > b.denom)

      const inputs = [{
        address: from,
        coins: senderCoins
      }]
      const outputs = recipients.map(({ to, tokens, bnbs }) => {
        const receiverCoins = []
        if (asset && tokens) {
          receiverCoins.push({
            denom: asset,
            amount: new BN(tokens).multipliedBy(10 ** 8).toNumber()
          })
        }
        if (bnbs) {
          receiverCoins.push({
            denom: BNB_ASSET,
            amount: new BN(bnbs).multipliedBy(10 ** 8).toNumber()
          })
        }
        receiverCoins.sort((a, b) => a.denom > b.denom)
        return {
          address: to,
          coins: receiverCoins
        }
      })

      msg = {
        inputs: inputs.map((x) => ({
          ...x,
          address: crypto.decodeAddress(x.address)
        })),
        outputs: outputs.map((x) => ({
          ...x,
          address: crypto.decodeAddress(x.address)
        })),
        msgType: 'MsgSend'
      }

      this.signMsg = {
        inputs,
        outputs
      }
    }

    this.tx = new TransactionBnc({
      account_number: accountNumber,
      chain_id: FOREIGN_CHAIN_ID,
      memo,
      msg,
      sequence,
      type: msg.msgType
    })
  }

  getSignBytes() {
    return this.tx.getSignBytes(this.signMsg)
  }

  addSignature(publicKey, signature) {
    const yLast = parseInt(publicKey.y[publicKey.y.length - 1], 16)
    const n = new BN('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141', 16)
    const s = new BN(signature.s, 16)
    if (s.gt(n.div(2))) {
      logger.debug('Normalizing s')
      // eslint-disable-next-line no-param-reassign
      signature.s = n.minus(s).toString(16)
    }
    const publicKeyEncoded = Buffer.from(`eb5ae98721${yLast % 2 ? '03' : '02'}${padZeros(publicKey.x, 64)}`, 'hex')
    this.tx.signatures = [{
      pub_key: publicKeyEncoded,
      signature: Buffer.from(padZeros(signature.r, 64) + padZeros(signature.s, 64), 'hex'),
      account_number: this.tx.account_number,
      sequence: this.tx.sequence
    }]
    return this.tx.serialize()
      .replace(/ce6dc043/, 'bea6e301') // until 'SetAccountFlagsMsg' is not available
  }
}

module.exports = Transaction
