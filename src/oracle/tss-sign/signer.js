const exec = require('child_process')
const fs = require('fs')
const amqp = require('amqplib')
const crypto = require('crypto')
const bech32 = require('bech32')
const BN = require('bignumber.js')

const { RABBITMQ_URL, FOREIGN_URL, PROXY_URL } = process.env
const FOREIGN_ASSET = 'BNB'
const Transaction = require('./tx')
const axios = require('axios')

const httpClient = axios.create({ baseURL: FOREIGN_URL })

async function main () {
  console.log('Connecting to RabbitMQ server')
  const connection = await connectRabbit(RABBITMQ_URL)
  console.log('Connecting to signature events queue')
  const channel = await connection.createChannel()
  const queue = await channel.assertQueue('signQueue')

  channel.prefetch(1)
  channel.consume(queue.queue, async msg => {
    const data = JSON.parse(msg.content)

    console.log('Consumed sign event')
    console.log(data)
    const { recipient, value, nonce, epoch } = data

    if (recipient) {
      const keysFile = `/keys/keys${epoch}.store`

      const { address, publicKey } = await getAccountFromFile(keysFile)
      console.log(`Tx from ${address}`)

      const account = await getAccount(address)

      console.log(`Building corresponding trasfer transaction, nonce ${nonce}, recipient ${recipient}`)
      const tx = new Transaction(address, account.account_number, nonce, recipient, value, FOREIGN_ASSET)

      const hash = crypto.createHash('sha256').update(tx.getSignBytes()).digest('hex')

      console.log(`Starting signature generation for transaction hash ${hash}`)
      const cmd = exec.execFile('./sign-entrypoint.sh', [PROXY_URL, keysFile, hash], async () => {
        if (fs.existsSync('signature')) {
          console.log('Finished signature generation')
          const signature = JSON.parse(fs.readFileSync('signature'))
          console.log(signature)

          console.log('Building signed transaction')
          const signedTx = tx.addSignature(publicKey, { r: signature[1], s: signature[3] })

          console.log('Sending transaction')
          console.log(signedTx)
          await sendTx(signedTx)
        }
        await waitForAccountNonce(address, nonce + 1)

        channel.ack(msg)
      })
      cmd.stdout.on('data', data => console.log(data.toString()))
      cmd.stderr.on('data', data => console.error(data.toString()))
    } else {
      const accountFile = await waitLastAccountEpoch(epoch)

      // If new keys with greater epoch already exists
      if (accountFile === null) {
        channel.ack(msg)
        return
      }
      const to = accountFile.address
      const prevEpoch = getPrevEpoch(epoch)

      const prevKeysFile = `/keys/keys${prevEpoch}.store`
      const { address: from, publicKey } = await getAccountFromFile(prevKeysFile)
      console.log(`Tx from ${from}, to ${to}`)

      const account = await getAccount(from)

      const maxValue = new BN(account.balances.find(x => x.symbol === FOREIGN_ASSET).free).minus(new BN(37500).div(10 ** 8))
      console.log(`Building corresponding transaction for transferring all funds, nonce ${account.sequence}, recipient ${to}`)
      const tx = new Transaction(from, account.account_number, account.sequence, to, maxValue, FOREIGN_ASSET)

      const hash = crypto.createHash('sha256').update(tx.getSignBytes()).digest('hex')

      fs.unlinkSync('signature')

      console.log(`Starting signature generation for transaction hash ${hash}`)
      const cmd = exec.execFile('./sign-entrypoint.sh', [PROXY_URL, prevKeysFile, hash], async () => {
        if (fs.existsSync('signature')) {
          console.log('Finished signature generation')
          const signature = JSON.parse(fs.readFileSync('signature'))
          console.log(signature)

          console.log('Building signed transaction')
          const signedTx = tx.addSignature(publicKey, { r: signature[1], s: signature[3] })

          console.log('Sending transaction')
          console.log(signedTx)
          await sendTx(signedTx)
        }
        await waitForAccountNonce(from, account.sequence + 1)

        await confirm(`/keys/keys${epoch}.store`)

        channel.ack(msg)
      })
      cmd.stdout.on('data', data => console.log(data.toString()))
      cmd.stderr.on('data', data => console.error(data.toString()))
    }
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

async function confirm (keysFile) {
  exec.execSync(`curl -X POST -H "Content-Type: application/json" -d @"${keysFile}" "${PROXY_URL}/confirm"`, { stdio: 'pipe' })
}

async function getAccountFromFile (file) {
  console.log(`Reading ${file}`)
  while (!fs.existsSync(file)) {
    console.log('Waiting for needed epoch key', file)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const publicKey = JSON.parse(fs.readFileSync(file))[5]
  return {
    address: publicKeyToAddress(publicKey),
    publicKey: publicKey
  }
}

function getPrevEpoch (epoch) {
  return Math.max(0, ...fs.readdirSync('/keys').map(x => parseInt(x.split('.')[0].substr(4))).filter(x => x < epoch))
}

async function waitLastAccountEpoch (epoch) {
  while (true) {
    const curEpoch = Math.max(0, ...fs.readdirSync('/keys').map(x => parseInt(x.split('.')[0].substr(4))))
    if (curEpoch === epoch)
      return getAccountFromFile(`/keys/keys${epoch}.store`)
    else if (curEpoch > epoch)
      return null
    else
      await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

async function waitForAccountNonce (address, nonce) {
  console.log(`Waiting for account ${address} to have nonce ${nonce}`)
  while (true) {
    const sequence = (await getAccount(address)).sequence
    if (sequence === nonce)
      break
    await new Promise(resolve => setTimeout(resolve, 1000))
    console.log('Waiting for needed account nonce')
  }
  console.log('Account nonce is OK')
}

async function getAccount (address) {
  console.log(`Getting account ${address} data`)
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

function publicKeyToAddress ({ x, y }) {
  const compact = (parseInt(y[y.length - 1], 16) % 2 ? '03' : '02') + padZeros(x, 64)
  const sha256Hash = crypto.createHash('sha256').update(Buffer.from(compact, 'hex')).digest('hex')
  const hash = crypto.createHash('ripemd160').update(Buffer.from(sha256Hash, 'hex')).digest('hex')
  const words = bech32.toWords(Buffer.from(hash, 'hex'))
  return bech32.encode('tbnb', words)
}

function padZeros (s, len) {
  while (s.length < len)
    s = '0' + s
  return s
}
