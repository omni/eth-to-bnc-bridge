const Bnc = require('@binance-chain/javascript-sdk')

const { delay } = require('./wait')

const { FOREIGN_URL, FOREIGN_ASSET } = process.env

module.exports = async function main(privateKey) {
  const client = new Bnc(FOREIGN_URL)
  client.chooseNetwork('testnet')

  await client.setPrivateKey(privateKey)

  await client.initChain()
  const from = client.getClientKeyAddress()

  await delay(1000)

  return {
    async transfer(to, tokens, bnbs) {
      const outputs = [{
        to,
        coins: []
      }]
      if (tokens) {
        outputs[0].coins.push({
          denom: FOREIGN_ASSET,
          amount: tokens
        })
      }
      if (bnbs) {
        outputs[0].coins.push({
          denom: 'BNB',
          amount: bnbs
        })
      }
      await client.multiSend(from, outputs, 'funding')
    },
    async exchange(to, value) {
      await client.transfer(from, to, value.toString(), FOREIGN_ASSET, '')
    }
  }
}
