const exec = require('child_process')
const fs = require('fs')
const express = require('express')
const axios = require('axios')

const logger = require('./logger')
const { connectRabbit, assertQueue } = require('./amqp')
const { publicKeyToAddress } = require('./crypto')
const { delay } = require('./wait')

const { RABBITMQ_URL, PROXY_URL } = process.env

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

async function keygenConsumer(msg) {
  const { epoch, parties, threshold } = JSON.parse(msg.content)
  logger.info(`Consumed new epoch event, starting keygen for epoch ${epoch}`)

  const keysFile = `/keys/keys${epoch}.store`

  logger.info('Running ./keygen-entrypoint.sh')
  currentKeygenEpoch = epoch

  writeParams(parties, threshold)
  const cmd = exec.execFile('./keygen-entrypoint.sh', [PROXY_URL, keysFile], async () => {
    currentKeygenEpoch = null
    if (fs.existsSync(keysFile)) {
      logger.info(`Finished keygen for epoch ${epoch}`)
      const publicKey = JSON.parse(fs.readFileSync(keysFile))[5]
      logger.warn(`Generated multisig account in binance chain: ${publicKeyToAddress(publicKey)}`)

      logger.info('Sending keys confirmation')
      await confirmKeygen(publicKey, epoch)
    } else {
      logger.warn(`Keygen for epoch ${epoch} failed`)
    }
    logger.debug('Ack for keygen message')
    channel.ack(msg)
  })
  cmd.stdout.on('data', (data) => logger.debug(data.toString()))
  cmd.stderr.on('data', (data) => logger.debug(data.toString()))
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
      exec.execSync('pkill gg18_keygen || true')
    }
    channel.ack(msg)
  })
}


app.get('/start', (req, res) => {
  logger.info('Ready to start')
  ready = true
  res.send()
})
app.listen(8001, () => logger.debug('Listening on 8001'))

main()
