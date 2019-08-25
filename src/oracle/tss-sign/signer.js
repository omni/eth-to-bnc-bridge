const exec = require('child_process')
const fs = require('fs')
const amqp = require('amqplib')
const crypto = require('crypto')
const bech32 = require('bech32')
const BN = require('bignumber.js')
const express = require('express')

const app = express()
app.get('/restart/:attempt', restart)
app.listen(8001, () => console.log('Listening on 8001'))

const { RABBITMQ_URL, FOREIGN_URL, PROXY_URL, FOREIGN_ASSET } = process.env
const Transaction = require('./tx')
const axios = require('axios')

const httpClient = axios.create({ baseURL: FOREIGN_URL })

let attempt
let nextAttempt = null
let cancelled

async function main () {
  console.log('Connecting to RabbitMQ server')
  const connection = await connectRabbit(RABBITMQ_URL)
  console.log('Connecting to signature events queue')
  const channel = await connection.createChannel()
  const signQueue = await channel.assertQueue('signQueue')

  channel.prefetch(1)
  channel.consume(signQueue.queue, async msg => {
    const data = JSON.parse(msg.content)

    console.log('Consumed sign event')
    console.log(data)
    const { recipient, value, nonce, epoch, newEpoch, parties, threshold } = data

    const keysFile = `/keys/keys${epoch}.store`
    const { address: from, publicKey } = await getAccountFromFile(keysFile)
    const account = await getAccount(from)

    console.log('Writing params')
    fs.writeFileSync('./params', JSON.stringify({ parties: parties.toString(), threshold: threshold.toString() }))

    attempt = 1

    if (recipient && account.sequence <= nonce) {
      while (true) {
        console.log(`Building corresponding transfer transaction, nonce ${nonce}, recipient ${recipient}`)
        const tx = new Transaction({
          from,
          accountNumber: account.account_number,
          sequence: nonce,
          to: recipient,
          tokens: value,
          asset: FOREIGN_ASSET,
          memo: `Attempt ${attempt}`
        })

        const hash = crypto.createHash('sha256').update(tx.getSignBytes()).digest('hex')
        console.log(`Starting signature generation for transaction hash ${hash}`)
        const done = await sign(keysFile, hash, tx, publicKey) && await waitForAccountNonce(from, nonce + 1)

        if (done) {
          break
        }
        attempt = nextAttempt ? nextAttempt : attempt + 1
        console.log(`Sign failed, starting next attempt ${attempt}`)
        nextAttempt = null
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } else if (account.sequence <= nonce) {
      const newKeysFile = `/keys/keys${newEpoch}.store`
      const { address: to } = await getAccountFromFile(newKeysFile)

      while (true) {
        console.log(`Building corresponding transaction for transferring all funds, nonce ${nonce}, recipient ${to}`)
        const tx = new Transaction({
          from,
          accountNumber: account.account_number,
          sequence: nonce,
          to,
          tokens: account.balances.find(x => x.symbol === FOREIGN_ASSET).free,
          asset: FOREIGN_ASSET,
          bnbs: new BN(account.balances.find(x => x.symbol === 'BNB').free).minus(new BN(60000).div(10 ** 8)),
          memo: `Attempt ${attempt}`
        })

        const hash = crypto.createHash('sha256').update(tx.getSignBytes()).digest('hex')
        console.log(`Starting signature generation for transaction hash ${hash}`)
        const done = await sign(keysFile, hash, tx, publicKey) && await waitForAccountNonce(from, nonce + 1)

        if (done) {
          await confirmFundsTransfer()
          break
        }
        attempt = nextAttempt ? nextAttempt : attempt + 1
        console.log(`Sign failed, starting next attempt ${attempt}`)
        nextAttempt = null
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    else {
      console.log('Tx has been already sent')
    }
    console.log('Acking message')
    channel.ack(msg)
  })
}

main()

function sign (keysFile, hash, tx, publicKey) {
  return new Promise(resolve => {
    const cmd = exec.execFile('./sign-entrypoint.sh', [PROXY_URL, keysFile, hash], async (error) => {
      if (fs.existsSync('signature')) {
        console.log('Finished signature generation')
        const signature = JSON.parse(fs.readFileSync('signature'))
        console.log(signature)

        console.log('Building signed transaction')
        const signedTx = tx.addSignature(publicKey, { r: signature[1], s: signature[3] })

        console.log('Sending transaction')
        console.log(signedTx)
        await sendTx(signedTx)
        resolve(true)
      } else if (error === null || error.code === 0) {
        resolve(true)
      } else {
        console.log('Sign failed')
        resolve(false)
      }
    })
    cmd.stdout.on('data', data => console.log(data.toString()))
    cmd.stderr.on('data', data => console.error(data.toString()))
  })
}

function restart (req, res) {
  console.log('Cancelling current sign')
  nextAttempt = req.params.attempt
  exec.execSync('pkill gg18_sign || true')
  cancelled = true
  res.send('Cancelled')
}

function connectRabbit (url) {
  return amqp.connect(url).catch(() => {
    console.log('Failed to connect, reconnecting')
    return new Promise(resolve =>
      setTimeout(() => resolve(connectRabbit(url)), 1000)
    )
  })
}

function confirmFundsTransfer () {
  exec.execSync(`curl -X POST -H "Content-Type: application/json" "${PROXY_URL}/confirmFundsTransfer"`, { stdio: 'pipe' })
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

async function waitForAccountNonce (address, nonce) {
  cancelled = false
  console.log(`Waiting for account ${address} to have nonce ${nonce}`)
  while (!cancelled) {
    const sequence = (await getAccount(address)).sequence
    if (sequence >= nonce)
      break
    await new Promise(resolve => setTimeout(resolve, 1000))
    console.log('Waiting for needed account nonce')
  }
  console.log('Account nonce is OK')
  return !cancelled
}

function getAccount (address) {
  console.log(`Getting account ${address} data`)
  return httpClient
    .get(`/api/v1/account/${address}`)
    .then(res => res.data)
    .catch(() => {
      console.log('Retrying')
      return getAccount(address)
    })
}

function sendTx (tx) {
  return httpClient
    .post(`/api/v1/broadcast?sync=true`, tx, {
      headers: {
        'Content-Type': 'text/plain'
      }
    })
    .catch(err => {
      if (err.response.data.message.includes('Tx already exists in cache'))
        console.log('Tx already exists in cache')
      else {
        console.log(err.response)
        console.log('Something failed, restarting')
        return new Promise(resolve => setTimeout(() => resolve(sendTx(tx)), 1000))
      }
    })
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
