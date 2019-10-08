const exec = require('child_process')
const fs = require('fs')

const logger = require('./logger')
const { connectRabbit, assertQueue } = require('./amqp')
const { publicKeyToAddress } = require('./crypto')

const { RABBITMQ_URL, PROXY_URL } = process.env

let currentKeygenEpoch = null

async function main () {
  logger.info('Connecting to RabbitMQ server')
  const channel = await connectRabbit(RABBITMQ_URL)
  logger.info('Connecting to epoch events queue')
  const keygenQueue = await assertQueue(channel, 'keygenQueue')
  const cancelKeygenQueue = await assertQueue(channel, 'cancelKeygenQueue')

  channel.prefetch(1)
  keygenQueue.consume(msg => {
    const { epoch, parties, threshold } = JSON.parse(msg.content)
    logger.info(`Consumed new epoch event, starting keygen for epoch ${epoch}`)

    const keysFile = `/keys/keys${epoch}.store`

    logger.info('Running ./keygen-entrypoint.sh')
    currentKeygenEpoch = epoch

    logger.debug('Writing params')
    fs.writeFileSync('./params', JSON.stringify({ parties: parties.toString(), threshold: threshold.toString() }))
    const cmd = exec.execFile('./keygen-entrypoint.sh', [ PROXY_URL, keysFile ], async () => {
      currentKeygenEpoch = null
      if (fs.existsSync(keysFile)) {
        logger.info(`Finished keygen for epoch ${epoch}`)
        const publicKey = JSON.parse(fs.readFileSync(keysFile))[5]
        logger.warn(`Generated multisig account in binance chain: ${publicKeyToAddress(publicKey)}`)

        logger.info('Sending keys confirmation')
        await confirmKeygen(keysFile)
      } else {
        logger.warn(`Keygen for epoch ${epoch} failed`)
      }
      logger.debug('Ack for keygen message')
      channel.ack(msg)
    })
    cmd.stdout.on('data', data => logger.debug(data.toString()))
    cmd.stderr.on('data', data => logger.debug(data.toString()))
  })

  cancelKeygenQueue.consume(async msg => {
    const { epoch } = JSON.parse(msg.content)
    logger.info(`Consumed new cancel event for epoch ${epoch} keygen`)
    if (currentKeygenEpoch === epoch) {
      logger.info('Cancelling current keygen')
      exec.execSync('pkill gg18_keygen || true')
    }
    channel.ack(msg)
  })
}

main()

async function confirmKeygen (keysFile) {
  exec.execSync(`curl -X POST -H "Content-Type: application/json" -d @"${keysFile}" "${PROXY_URL}/confirmKeygen"`, { stdio: 'pipe' })
}
