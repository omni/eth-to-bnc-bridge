const exec = require('child_process')
const fs = require('fs')
const express = require('express')
const axios = require('axios')

const logger = require('../shared/logger')
const { connectRabbit, assertQueue } = require('../shared/amqp')
const { publicKeyToAddress } = require('../shared/crypto')
const { delay } = require('../shared/wait')

const { RABBITMQ_URL, PROXY_URL } = process.env
const KEYGEN_ATTEMPT_TIMEOUT = parseInt(process.env.KEYGEN_ATTEMPT_TIMEOUT, 10)
const KEYGEN_EPOCH_CHECK_INTERVAL = parseInt(process.env.KEYGEN_EPOCH_CHECK_INTERVAL, 10)

const KEYGEN_OK = 0
const KEYGEN_EPOCH_INTERRUPT = 1
const KEYGEN_FAILED = 2

const app = express()

const proxyClient = axios.create({ baseURL: PROXY_URL })

let channel
let currentKeygenEpoch = null
let ready = false

async function confirmKeygen({ x, y }, epoch) {
  await proxyClient.post('/confirmKeygen', {
    x,
    y,
    epoch
  })
}

function writeParams(parties, threshold) {
  logger.debug('Writing params')
  fs.writeFileSync('./params', JSON.stringify({
    parties: parties.toString(),
    threshold: (threshold - 1).toString()
  }))
}

function killKeygen() {
  exec.execSync('pkill gg18_keygen || true')
}

function restart(req, res) {
  logger.info('Manual cancelling current keygen attempt')
  killKeygen()
  res.send('Done')
}

function keygen(keysFile, epoch) {
  let restartTimeoutId
  let epochDaemonIntervalId
  let epochInterrupt

  return new Promise((resolve) => {
    const cmd = exec.execFile('./keygen-entrypoint.sh', [PROXY_URL, keysFile], (error) => {
      logger.trace('Keygen entrypoint exited, %o', error)
      clearTimeout(restartTimeoutId)
      clearInterval(epochDaemonIntervalId)
      currentKeygenEpoch = null
      if (fs.existsSync(keysFile)) {
        logger.info(`Finished keygen for epoch ${epoch}`)
        resolve(KEYGEN_OK)
      } else {
        logger.warn(`Keygen for epoch ${epoch} failed, will start new attempt`)
        resolve(epochInterrupt ? KEYGEN_EPOCH_INTERRUPT : KEYGEN_FAILED)
      }
    })
    cmd.stdout.on('data', (data) => {
      const str = data.toString()
      if (str.includes('Got all party signups')) {
        restartTimeoutId = setTimeout(killKeygen, KEYGEN_ATTEMPT_TIMEOUT)
      }
      logger.debug(str)
    })
    cmd.stderr.on('data', (data) => logger.debug(data.toString()))

    // Kill keygen if keygen for current epoch is already confirmed
    epochDaemonIntervalId = setInterval(async () => {
      logger.info(`Checking if bridge has confirmations keygen for epoch ${epoch}`)
      const { bridgeEpoch, bridgeStatus } = (await proxyClient.get('/status')).data
      logger.trace(`Current bridge epoch: ${bridgeEpoch}, current bridge status: ${bridgeStatus}`)
      if (bridgeEpoch > epoch || bridgeStatus > 3) {
        logger.info(`Bridge has already confirmed keygen for epoch ${epoch}`)
        epochInterrupt = true
        // Additional delay, maybe keygen will eventually finish
        await delay(5000)
        killKeygen()
      }
    }, KEYGEN_EPOCH_CHECK_INTERVAL)
  })
}

async function keygenConsumer(msg) {
  const { epoch, parties, threshold } = JSON.parse(msg.content)
  logger.info(`Consumed new epoch event, starting keygen for epoch ${epoch}`)

  const keysFile = `/keys/keys${epoch}.store`

  logger.info('Running ./keygen-entrypoint.sh')
  currentKeygenEpoch = epoch

  writeParams(parties, threshold)

  while (true) {
    const keygenResult = await keygen(keysFile, epoch)

    if (keygenResult === KEYGEN_OK) {
      const publicKey = JSON.parse(fs.readFileSync(keysFile))[5]
      logger.warn(`Generated multisig account in binance chain: ${publicKeyToAddress(publicKey)}`)

      logger.info('Sending keys confirmation')
      await confirmKeygen(publicKey, epoch)
      break
    } else if (keygenResult === KEYGEN_EPOCH_INTERRUPT) {
      logger.warn('Keygen was interrupted by epoch daemon')
      break
    }

    await delay(1000)
  }
  logger.info('Acking message')
  channel.ack(msg)
}

async function main() {
  channel = await connectRabbit(RABBITMQ_URL)
  logger.info('Connecting to epoch events queue')
  const keygenQueue = await assertQueue(channel, 'keygenQueue')
  const cancelKeygenQueue = await assertQueue(channel, 'cancelKeygenQueue')

  while (!ready) {
    await delay(1000)
  }

  channel.prefetch(1)
  keygenQueue.consume(keygenConsumer)

  cancelKeygenQueue.consume(async (msg) => {
    const { epoch } = JSON.parse(msg.content)
    logger.info(`Consumed new cancel event for epoch ${epoch} keygen`)
    if (currentKeygenEpoch === epoch) {
      logger.info('Cancelling current keygen')
      killKeygen()
    }
    channel.ack(msg)
  })
}

app.get('/restart', restart)
app.get('/start', (req, res) => {
  logger.info('Ready to start')
  ready = true
  res.send()
})
app.listen(8001, () => logger.debug('Listening on 8001'))

main()
