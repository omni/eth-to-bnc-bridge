const exec = require('child_process')
const fs = require('fs')
const amqp = require('amqplib')
const crypto = require('crypto')
const bech32 = require('bech32')

const { RABBITMQ_URL, FOREIGN_URL, PROXY_URL } = process.env
const Transaction = require('./tx')
const axios = require('axios')

const httpClient = axios.create({ baseURL: FOREIGN_URL })

async function main () {
  console.log('Connecting to RabbitMQ server')
  const connection = await connectRabbit(RABBITMQ_URL)
  console.log('Connecting to signature events queue')
  const channel = await connection.createConfirmChannel()
  const queue = await channel.assertQueue('signQueue')

  channel.prefetch(1)
  channel.consume(queue.queue, async msg => {
    const data = JSON.parse(msg.content)

    console.log('Consumed sign event')
    console.log(data)
    const { recipient, value, nonce, epoch } = data
    const keysFile = `/keys/keys${epoch}.store`

    console.log(`Reading ${keysFile}`)
    const { address, publicKey } = await getAccountFromFile(keysFile)
    console.log(`Tx from ${address}`)

    console.log('Getting account data')
    const account = await getAccount(address)

    console.log(`Building corresponding transaction, nonce ${nonce}, recipient ${recipient}`)
    const tx = new Transaction(address, account.account_number, nonce, recipient, value, 'BNB')
    const hash = crypto.createHash('sha256').update(tx.getSignBytes()).digest('hex')

    console.log(`Starting signature generation for transaction hash ${hash}`)
    const cmd = exec.execFile('./sign-entrypoint.sh', [PROXY_URL, keysFile, epoch, hash], async () => {
      console.log('Finished signature generation')
      const signature = JSON.parse(fs.readFileSync('signature'))
      console.log(signature)

      console.log('Building signed transaction')
      const signedTx = tx.addSignature(publicKey, { r: signature[1], s: signature[3] })

      console.log('Sending transaction')
      console.log(signedTx)
      await sendTx(signedTx)

      channel.ack(msg)
    })
    cmd.stdout.on('data', data => console.log(data.toString()))
    cmd.stderr.on('data', data => console.error(data.toString()))
  })

}

main()

async function connectRabbit (url) {
  return amqp.connect(url).catch(() => {
    console.log('Failed to connect, reconnecting')
    return new Promise(resolve =>
      setTimeout(() => resolve(connectRabbit(url)), 1000)
    )
  })
}

async function getAccountFromFile (file) {
  while (!fs.existsSync(file)) {
    console.log('Waiting for needed epoch key')
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const publicKey = JSON.parse(fs.readFileSync(file))[5]
  return {
    address: publicKeyToAddress(publicKey),
    publicKey: publicKey
  }
}

async function getAccount (address) {
  return httpClient
    .get(`/api/v1/account/${address}`)
    .then(res => res.data)
}

async function sendTx (tx) {
  return httpClient
    .post(`/api/v1/broadcast?sync=true`, tx, {
      headers: {
        'Content-Type': 'text/plain'
      }
    })
    .then(x => console.log(x.response), x => console.log(x.response))
}

function buildTx (acc, nonce, to, value) {
  const tx = new Transaction({
    account_number: acc.account_number,
    chain_id: 'Binance-Chain-Nile',
    memo: '',
    msg: {
      'inputs': [
        {
          'coins': [
            {
              'denom': 'BNB',
              'amount': value.toString()
            }
          ],
          'address': acc.address
        }
      ],
      'outputs': [
        {
          'address': to,
          'coins': [
            {
              'denom': 'BNB',
              'amount': value.toString()
            }
          ]
        }
      ]
    },
    type: 'MsgSend',
    sequence: nonce
  })
  return tx.getSignBytes(tx.msgs[0])
}

function buildSignedTx (acc, publicKey, nonce, to, value, signature) {
  const tx = new Transaction({
    account_number: acc.account_number,
    chain_id: 'Binance-Chain-Nile',
    memo: '',
    msg: {
      'inputs': [
        {
          'coins': [
            {
              'denom': 'BNB',
              'amount': value.toString()
            }
          ],
          'address': acc.address
        }
      ],
      'outputs': [
        {
          'address': to,
          'coins': [
            {
              'denom': 'BNB',
              'amount': value.toString()
            }
          ]
        }
      ]
    },
    type: 'MsgSend',
    sequence: nonce
  })
  tx.signatures = [{
    pub_key: Buffer.from(publicKey, 'hex', 38),
    signature: Buffer.concat([Buffer.from(signature[1], 'hex', 32), Buffer.from(signature[3], 'hex', 32)]),
    account_number: acc.account_number,
    sequence: nonce
  }]
  return tx
}

function encodePublicKey ({ x, y }) {
  return 'eb5ae98721' + (parseInt(y[63], 16) % 2 ? '03' : '02') + x
}

function publicKeyToAddress ({ x, y }) {
  const compact = (parseInt(y[63], 16) % 2 ? '03' : '02') + x
  const sha256Hash = crypto.createHash('sha256').update(Buffer.from(compact, 'hex')).digest('hex')
  const hash = crypto.createHash('ripemd160').update(Buffer.from(sha256Hash, 'hex')).digest('hex')
  const words = bech32.toWords(Buffer.from(hash, 'hex'))
  return bech32.encode('tbnb', words)
}
