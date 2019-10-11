const exec = require('child_process')
const fs = require('fs')
const BN = require('bignumber.js')
const express = require('express')

const logger = require('./logger')
const { connectRabbit, assertQueue } = require('./amqp')
const { publicKeyToAddress, sha256 } = require('./crypto')

const app = express()
app.get('/restart/:attempt', restart)
app.get('/start', (req, res) => {
  logger.info('Ready to start')
  ready = true
  res.send()
})
app.listen(8001, () => logger.debug('Listening on 8001'))

const { RABBITMQ_URL, FOREIGN_URL, PROXY_URL, FOREIGN_ASSET } = process.env
const Transaction = require('./tx')
const axios = require('axios')

const httpClient = axios.create({ baseURL: FOREIGN_URL })

let attempt
let nextAttempt = null
let cancelled
let ready = false

async function main () {
  logger.info('Connecting to RabbitMQ server')
  const channel = await connectRabbit(RABBITMQ_URL)
  logger.info('Connecting to signature events queue')
  const signQueue = await assertQueue(channel, 'signQueue')

  while (!ready) {
    await new Promise(res => setTimeout(res, 1000))
  }

  channel.prefetch(1)
  signQueue.consume(async msg => {
    const data = JSON.parse(msg.content)

    logger.info('Consumed sign event: %o', data)
    const { recipient, value, nonce, epoch, newEpoch, parties, threshold } = data

    const keysFile = `/keys/keys${epoch}.store`
    const { address: from, publicKey } = getAccountFromFile(keysFile)
    if (from === '') {
      logger.info('No keys found, acking message')
      channel.ack(msg)
      return
    }
    const account = await getAccount(from)

    logger.debug('Writing params')
    fs.writeFileSync('./params', JSON.stringify({ parties: parties.toString(), threshold: threshold.toString() }))

    attempt = 1

    if (recipient && account.sequence <= nonce) {
      while (true) {
        logger.info(`Building corresponding transfer transaction, nonce ${nonce}, recipient ${recipient}`)
        const tx = new Transaction({
          from,
          accountNumber: account.account_number,
          sequence: nonce,
          to: recipient,
          tokens: value,
          asset: FOREIGN_ASSET,
          memo: `Attempt ${attempt}`
        })

        const hash = sha256(tx.getSignBytes())
        logger.info(`Starting signature generation for transaction hash ${hash}`)
        const done = await sign(keysFile, hash, tx, publicKey) && await waitForAccountNonce(from, nonce + 1)

        if (done) {
          break
        }
        attempt = nextAttempt ? nextAttempt : attempt + 1
        logger.warn(`Sign failed, starting next attempt ${attempt}`)
        nextAttempt = null
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } else if (account.sequence <= nonce) {
      const newKeysFile = `/keys/keys${newEpoch}.store`
      const { address: to } = getAccountFromFile(newKeysFile)

      while (to !== '') {
        logger.info(`Building corresponding transaction for transferring all funds, nonce ${nonce}, recipient ${to}`)
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

        const hash = sha256(tx.getSignBytes())
        logger.info(`Starting signature generation for transaction hash ${hash}`)
        const done = await sign(keysFile, hash, tx, publicKey) && await waitForAccountNonce(from, nonce + 1)

        if (done) {
          await confirmFundsTransfer()
          break
        }
        attempt = nextAttempt ? nextAttempt : attempt + 1
        logger.warn(`Sign failed, starting next attempt ${attempt}`)
        nextAttempt = null
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } else {
      logger.debug('Tx has been already sent')
    }
    logger.info('Acking message')
    channel.ack(msg)
  })
}

main()

function sign (keysFile, hash, tx, publicKey) {
  return new Promise(resolve => {
    const cmd = exec.execFile('./sign-entrypoint.sh', [ PROXY_URL, keysFile, hash ], async (error) => {
      if (fs.existsSync('signature')) {
        logger.info('Finished signature generation')
        const signature = JSON.parse(fs.readFileSync('signature'))
        logger.debug('%o', signature)

        logger.info('Building signed transaction')
        const signedTx = tx.addSignature(publicKey, { r: signature[1], s: signature[3] })

        logger.info('Sending transaction')
        logger.debug(signedTx)
        await sendTx(signedTx)
        resolve(true)
      } else if (error === null || error.code === 0) {
        resolve(true)
      } else {
        logger.warn('Sign failed')
        resolve(false)
      }
    })
    cmd.stdout.on('data', data => logger.debug(data.toString()))
    cmd.stderr.on('data', data => logger.debug(data.toString()))
  })
}

function restart (req, res) {
  logger.info('Cancelling current sign')
  nextAttempt = req.params.attempt
  exec.execSync('pkill gg18_sign || true')
  cancelled = true
  res.send('Cancelled')
}

function confirmFundsTransfer () {
  exec.execSync(`curl -X POST -H "Content-Type: application/json" "${PROXY_URL}/confirmFundsTransfer"`, { stdio: 'pipe' })
}

function getAccountFromFile (file) {
  logger.debug(`Reading ${file}`)
  if (!fs.existsSync(file)) {
    logger.debug('No keys found, skipping')
    return { address: '' }
  }
  const publicKey = JSON.parse(fs.readFileSync(file))[5]
  return {
    address: publicKeyToAddress(publicKey),
    publicKey: publicKey
  }
}

async function waitForAccountNonce (address, nonce) {
  cancelled = false
  logger.info(`Waiting for account ${address} to have nonce ${nonce}`)
  while (!cancelled) {
    const sequence = (await getAccount(address)).sequence
    if (sequence >= nonce)
      break
    await new Promise(resolve => setTimeout(resolve, 1000))
    logger.debug('Waiting for needed account nonce')
  }
  logger.info('Account nonce is OK')
  return !cancelled
}

function getAccount (address) {
  logger.info(`Getting account ${address} data`)
  return httpClient
    .get(`/api/v1/account/${address}`)
    .then(res => res.data)
    .catch(() => {
      logger.debug('Retrying')
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
        logger.debug('Tx already exists in cache')
      else {
        logger.info('Something failed, restarting: %o', err.response)
        return new Promise(resolve => setTimeout(() => resolve(sendTx(tx)), 1000))
      }
    })
}
