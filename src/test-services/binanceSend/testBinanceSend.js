const Bnc = require('@binance-chain/javascript-sdk')

const { FOREIGN_URL, FOREIGN_ASSET, FOREIGN_PRIVATE_KEY } = process.env

const PRIVATE_KEY = process.env.PRIVATE_KEY || FOREIGN_PRIVATE_KEY

const client = new Bnc(FOREIGN_URL)

async function main() {
  client.chooseNetwork('testnet')
  await client.setPrivateKey(PRIVATE_KEY)

  await client.initChain()

  const from = client.getClientKeyAddress()
  const to = process.argv[2]
  const tokens = parseFloat(process.argv[3])
  let bnbs = process.argv[4]
  let receipt

  if (bnbs) {
    bnbs = parseFloat(bnbs)
    console.log(`Funding from ${from} to ${to}, ${tokens} ${FOREIGN_ASSET}, ${bnbs} BNB'`)
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
    receipt = await client.multiSend(from, outputs, 'funding')
  } else {
    console.log(`From ${from} to ${to}, ${tokens} ${FOREIGN_ASSET}'`)
    receipt = await client.transfer(from, to, tokens, FOREIGN_ASSET, '')
  }

  if (receipt.status === 200) {
    console.log(receipt.result[0].hash)
  } else {
    console.log(receipt)
  }
}

main()
