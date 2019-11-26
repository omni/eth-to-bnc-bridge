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
const proxyClient = axios.create({ baseURL: PROXY_URL })

const SIGN_OK = 0
const SIGN_NONCE_INTERRUPT = 1
const SIGN_FAILED = 2

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
  logger.info('Manual cancelling current sign attempt')
  killSigner()
  cancelled = true
  res.send('Done')
}

async function confirmFundsTransfer(epoch) {
  await proxyClient.post('/confirmFundsTransfer', {
    epoch
  })
}

async function confirmCloseEpoch(epoch) {
  await proxyClient.post('/confirmCloseEpoch', {
    epoch
  })
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

async function getFee() {
  logger.info('Getting fees')
  const response = await retry(() => httpClient.get('/api/v1/fees'))
  const multiTransferFee = response.data.find((fee) => fee.multi_transfer_fee).multi_transfer_fee
  return new BN(multiTransferFee * 2).div(10 ** 8)
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

async function sendTx(tx) {
  while (true) {
    try {
      return await httpClient.post('/api/v1/broadcast?sync=true', tx, {
        headers: {
          'Content-Type': 'text/plain'
        }
      })
    } catch (err) {
      logger.trace('Error, response data %o', err.response.data)
      if (err.response.data.message.includes('Tx already exists in cache')) {
        logger.debug('Tx already exists in cache')
        return true
      }
      if (err.response.data.message.includes(' < ')) {
        logger.warn('Insufficient funds, waiting for funds')
        await delay(60000)
      } else {
        logger.info('Something failed, restarting: %o', err.response)
        await delay(10000)
      }
    }
  }
}

function sign(keysFile, tx, publicKey, signerAddress) {
  let restartTimeoutId
  let nonceDaemonIntervalId
  let nonceInterrupt = false

  const hash = sha256(tx.getSignBytes())
  logger.info(`Starting signature generation for transaction hash ${hash}`)

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
        // Additional delay, maybe signer will eventually finish
        await delay(5000)
        killSigner()
      }
    }, SIGN_NONCE_CHECK_INTERVAL)
  })
}

function getAccountBalance(account, asset) {
  return account.balances.find((token) => token.symbol === asset).free
}

async function buildTx(from, account, data) {
  const { closeEpoch, newEpoch, nonce } = data

  const txOptions = {
    from,
    accountNumber: account.account_number,
    sequence: nonce,
    asset: FOREIGN_ASSET
  }
  let exchanges

  if (closeEpoch) {
    logger.info(`Building corresponding account flags transaction, nonce ${nonce}`)

    txOptions.flags = 0x01
  } else if (newEpoch) {
    const newKeysFile = `/keys/keys${newEpoch}.store`
    const to = getAccountFromFile(newKeysFile).address

    if (to === '') {
      return { tx: null }
    }

    logger.info(`Building corresponding transaction for transferring all funds, nonce ${nonce}, recipient ${to}`)
    const fee = await getFee()

    txOptions.recipients = [{
      to,
      tokens: getAccountBalance(account, FOREIGN_ASSET),
      bnbs: new BN(getAccountBalance(account, 'BNB')).minus(fee)
    }]
  } else {
    logger.info(`Building corresponding transfer transaction, nonce ${nonce}`)
    exchanges = await getExchangeMessages(nonce)
    const exchangesData = exchanges.map((exchangeMsg) => JSON.parse(exchangeMsg.content))

    txOptions.recipients = exchangesData.map(({ value, recipient }) => ({
      to: recipient,
      tokens: value
    }))
  }

  const tx = new Transaction(txOptions)

  return {
    tx,
    exchanges
  }
}

function writeParams(parties, threshold) {
  logger.debug('Writing params')
  fs.writeFileSync('./params', JSON.stringify({
    parties: parties.toString(),
    threshold: (threshold - 1).toString()
  }))
}

async function consumer(msg) {
  const data = JSON.parse(msg.content)

  logger.info('Consumed sign event: %o', data)
  const {
    nonce, epoch, newEpoch, parties, threshold, closeEpoch
  } = data

  const keysFile = `/keys/keys${epoch || closeEpoch}.store`
  const { address: from, publicKey } = getAccountFromFile(keysFile)
  if (from === '') {
    logger.info('No keys found, acking message')
    channel.ack(msg)
    return
  }
  const account = await getAccount(from)

  if (nonce > account.sequence) {
    logger.debug('Tx has been already sent')
    logger.info('Acking message (skipped nonce)')
    channel.ack(msg)
    return
  }

  writeParams(parties, threshold)

  const { tx, exchanges } = await buildTx(from, account, data)

  while (tx !== null) {
    const signResult = await sign(keysFile, tx, publicKey, from)

    if (signResult === SIGN_OK || signResult === SIGN_NONCE_INTERRUPT) {
      if (closeEpoch) {
        await confirmCloseEpoch(closeEpoch)
      } else if (newEpoch) {
        await confirmFundsTransfer(epoch)
      } else {
        // eslint-disable-next-line no-loop-func
        exchanges.forEach((exchangeMsg) => channel.ack(exchangeMsg))
      }
      break
    }

    logger.warn('Sign failed, starting next attempt')
    await delay(1000)
  }
  logger.info('Acking message')
  channel.ack(msg)
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
  signQueue.consume(consumer)
}

app.get('/restart', restart)
app.get('/start', (req, res) => {
  logger.info('Ready to start')
  ready = true
  res.send()
})
app.listen(8001, () => logger.debug('Listening on 8001'))

main()
