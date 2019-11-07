const exec = require('child_process')
const fs = require('fs')
const BN = require('bignumber.js')
const axios = require('axios')
const express = require('express')

const logger = require('./logger')
const { connectRabbit, assertQueue } = require('./amqp')
const { publicKeyToAddress, sha256 } = require('./crypto')
const { delay, retry } = require('./wait')

const Transaction = require('./tx')

const app = express()

const {
  RABBITMQ_URL, FOREIGN_URL, PROXY_URL, FOREIGN_ASSET
} = process.env
const SIGN_ATTEMPT_TIMEOUT = parseInt(process.env.SIGN_ATTEMPT_TIMEOUT, 10)
const SIGN_NONCE_CHECK_INTERVAL = parseInt(process.env.SIGN_NONCE_CHECK_INTERVAL, 10)
const SEND_TIMEOUT = parseInt(process.env.SEND_TIMEOUT, 10)

const httpClient = axios.create({ baseURL: FOREIGN_URL })

const SIGN_OK = 0
const SIGN_NONCE_INTERRUPT = 1
const SIGN_FAILED = 2

let attempt
let nextAttempt = null
let cancelled
let ready = false
let exchangeQueue
let channel

async function getExchangeMessages(nonce) {
  logger.debug('Getting exchange messages')
  const messages = []
  while (true) {
    const msg = await exchangeQueue.get()
    if (msg === false) {
      break
    }
    const data = JSON.parse(msg.content)
    logger.debug('Got message %o', data)
    if (data.nonce !== nonce) {
      channel.nack(msg, false, true)
      break
    }
    messages.push(msg)
  }
  logger.debug(`Found ${messages.length} messages`)
  return messages
}

function killSigner() {
  exec.execSync('pkill gg18_sign || true')
}

function restart(req, res) {
  if (/^[0-9]+$/.test(req.params.attempt)) {
    logger.info(`Manual cancelling current sign attempt, starting ${req.params.attempt} attempt`)
    nextAttempt = parseInt(req.params.attempt, 10)
    killSigner()
    cancelled = true
    res.send('Done')
  }
}

function confirmFundsTransfer() {
  exec.execSync(`curl -X POST -H "Content-Type: application/json" "${PROXY_URL}/confirmFundsTransfer"`, { stdio: 'pipe' })
}

function getAccountFromFile(file) {
  logger.debug(`Reading ${file}`)
  if (!fs.existsSync(file)) {
    logger.debug('No keys found, skipping')
    return { address: '' }
  }
  const publicKey = JSON.parse(fs.readFileSync(file))[5]
  return {
    address: publicKeyToAddress(publicKey),
    publicKey
  }
}

async function getAccount(address) {
  logger.info(`Getting account ${address} data`)
  const response = await retry(() => httpClient.get(`/api/v1/account/${address}`))
  return response.data
}

async function waitForAccountNonce(address, nonce) {
  cancelled = false
  logger.info(`Waiting for account ${address} to have nonce ${nonce}`)
  while (!cancelled) {
    const { sequence } = await getAccount(address)
    if (sequence >= nonce) {
      break
    }
    await delay(1000)
    logger.debug('Waiting for needed account nonce')
  }
  logger.info('Account nonce is OK')
  return !cancelled
}


function sendTx(tx) {
  return httpClient
    .post('/api/v1/broadcast?sync=true', tx, {
      headers: {
        'Content-Type': 'text/plain'
      }
    })
    .catch(async (err) => {
      if (err.response.data.message.includes('Tx already exists in cache')) {
        logger.debug('Tx already exists in cache')
        return true
      }
      logger.info('Something failed, restarting: %o', err.response)
      await delay(1000)
      return await sendTx(tx)
    })
}

function sign(keysFile, hash, tx, publicKey, signerAddress) {
  let restartTimeoutId
  let nonceDaemonIntervalId
  let nonceInterrupt = false
  return new Promise((resolve) => {
    const cmd = exec.execFile('./sign-entrypoint.sh', [PROXY_URL, keysFile, hash], async (error) => {
      logger.trace('Sign entrypoint exited, %o', error)
      clearInterval(nonceDaemonIntervalId)
      clearTimeout(restartTimeoutId)
      if (fs.existsSync('signature')) { // if signature was generated
        logger.info('Finished signature generation')
        const signature = JSON.parse(fs.readFileSync('signature'))
        logger.debug('%o', signature)

        logger.info('Building signed transaction')
        const signedTx = tx.addSignature(publicKey, {
          r: signature[1],
          s: signature[3]
        })

        logger.info('Sending transaction')
        logger.debug(signedTx)
        await sendTx(signedTx)
        // if nonce does not update in some time, cancel process, consider sign as failed
        const sendTimeoutId = setTimeout(() => {
          cancelled = true
        }, SEND_TIMEOUT)
        const waitResponse = await waitForAccountNonce(signerAddress, tx.tx.sequence + 1)
        clearTimeout(sendTimeoutId)
        resolve(waitResponse ? SIGN_OK : SIGN_FAILED)
      } else if (error === null || error.code === 0) { // if was already enough parties
        const signTimeoutId = setTimeout(() => {
          cancelled = true
        }, SIGN_ATTEMPT_TIMEOUT)
        const waitResponse = await waitForAccountNonce(signerAddress, tx.tx.sequence + 1)
        clearTimeout(signTimeoutId)
        resolve(waitResponse ? SIGN_OK : SIGN_FAILED)
      } else if (error.code === 143) { // if process was killed
        logger.warn('Sign process was killed')
        resolve(nonceInterrupt ? SIGN_NONCE_INTERRUPT : SIGN_FAILED)
      } else if (error.code !== null && error.code !== 0) { // if process has failed
        logger.warn('Sign process has failed')
        resolve(SIGN_FAILED)
      } else {
        logger.warn('Unknown error state %o', error)
        resolve(SIGN_FAILED)
      }
    })
    cmd.stdout.on('data', (data) => {
      const str = data.toString()
      if (str.includes('Got all party ids')) {
        restartTimeoutId = setTimeout(killSigner, SIGN_ATTEMPT_TIMEOUT)
      }
      logger.debug(str)
    })
    cmd.stderr.on('data', (data) => logger.debug(data.toString()))

    // Kill signer if current nonce is already processed at some time
    nonceDaemonIntervalId = setInterval(async () => {
      logger.info(`Checking if account ${signerAddress} has nonce ${tx.tx.sequence + 1}`)
      const { sequence } = await getAccount(signerAddress)
      if (sequence > tx.tx.sequence) {
        logger.info('Account already has needed nonce, cancelling current sign process')
        nonceInterrupt = true
        killSigner()
      }
    }, SIGN_NONCE_CHECK_INTERVAL)
  })
}

async function main() {
  channel = await connectRabbit(RABBITMQ_URL)
  logger.info('Connecting to signature events queue')
  exchangeQueue = await assertQueue(channel, 'exchangeQueue')
  const signQueue = await assertQueue(channel, 'signQueue')

  while (!ready) {
    await delay(1000)
  }

  channel.prefetch(1)
  signQueue.consume(async (msg) => {
    const data = JSON.parse(msg.content)

    logger.info('Consumed sign event: %o', data)
    const {
      nonce, epoch, newEpoch, parties, threshold
    } = data

    const keysFile = `/keys/keys${epoch}.store`
    const { address: from, publicKey } = getAccountFromFile(keysFile)
    if (from === '') {
      logger.info('No keys found, acking message')
      channel.ack(msg)
      return
    }
    const account = await getAccount(from)

    logger.debug('Writing params')
    fs.writeFileSync('./params', JSON.stringify({
      parties: parties.toString(),
      threshold: (threshold - 1).toString()
    }))

    attempt = 1

    if (!newEpoch) {
      const exchanges = await getExchangeMessages(nonce)
      const exchangesData = exchanges.map((exchangeMsg) => JSON.parse(exchangeMsg.content))

      if (exchanges.length > 0 && account.sequence <= nonce) {
        const recipients = exchangesData.map(({ value, recipient }) => ({
          to: recipient,
          tokens: value
        }))

        while (true) {
          logger.info(`Building corresponding transfer transaction, nonce ${nonce}`)

          const tx = new Transaction({
            from,
            accountNumber: account.account_number,
            sequence: nonce,
            recipients,
            asset: FOREIGN_ASSET,
            memo: `Attempt ${attempt}`
          })

          const hash = sha256(tx.getSignBytes())
          logger.info(`Starting signature generation for transaction hash ${hash}`)
          const signResult = await sign(keysFile, hash, tx, publicKey, from)

          if (signResult === SIGN_OK || signResult === SIGN_NONCE_INTERRUPT) {
            // eslint-disable-next-line no-loop-func
            exchanges.forEach((exchangeMsg) => channel.ack(exchangeMsg))
            break
          }

          // signer either failed, or timed out after parties signup
          attempt = nextAttempt || attempt + 1
          nextAttempt = null
          logger.warn(`Sign failed, starting next attempt ${attempt}`)
          await delay(1000)
        }
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
          recipients: [{
            to,
            tokens: account.balances.find((token) => token.symbol === FOREIGN_ASSET).free,
            bnbs: new BN(account.balances.find((token) => token.symbol === 'BNB').free).minus(new BN(60000).div(10 ** 8))
          }],
          asset: FOREIGN_ASSET,
          memo: `Attempt ${attempt}`
        })

        const hash = sha256(tx.getSignBytes())
        logger.info(`Starting signature generation for transaction hash ${hash}`)
        const signResult = await sign(keysFile, hash, tx, publicKey, from)

        if (signResult === SIGN_OK || signResult === SIGN_NONCE_INTERRUPT) {
          await confirmFundsTransfer()
          break
        }

        // signer either failed, or timed out after parties signup
        attempt = nextAttempt || attempt + 1
        nextAttempt = null
        logger.warn(`Sign failed, starting next attempt ${attempt}`)
        await delay(1000)
      }
    } else {
      logger.debug('Tx has been already sent')
    }
    logger.info('Acking message')
    channel.ack(msg)
  })
}

app.get('/restart/:attempt', restart)
app.get('/start', (req, res) => {
  logger.info('Ready to start')
  ready = true
  res.send()
})
app.listen(8001, () => logger.debug('Listening on 8001'))

main()
