const exec = require('child_process')
const fs = require('fs')
const crypto = require('crypto')
const bech32 = require('bech32')
const amqp = require('amqplib')

const { RABBITMQ_URL, PROXY_URL } = process.env

async function main () {
  console.log('Connecting to RabbitMQ server')
  const connection = await connectRabbit(RABBITMQ_URL)
  console.log('Connecting to epoch events queue')
  const channel = await connection.createConfirmChannel()
  const queue = await channel.assertQueue('epochQueue')

  channel.prefetch(1)
  channel.consume(queue.queue, msg => {
    const data = JSON.parse(msg.content)
    console.log(`Consumed new epoch event, starting keygen for epoch ${data.epoch}`)

    const keysFile = `/keys/keys${data.epoch}.store`

    console.log('Running ./keygen-entrypoint.sh')
    const cmd = exec.execFile('./keygen-entrypoint.sh', [PROXY_URL, keysFile, data.epoch], () => {
      console.log('Finished keygen')
      const publicKey = JSON.parse(fs.readFileSync(keysFile).toString())[5]
      console.log(`Generated multisig account in binance chain: ${publicKeyToAddress(publicKey)}`)
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

function publicKeyToAddress({x, y}) {
  const compact = (parseInt(y[63], 16) % 2 ? '03' : '02') + x
  const sha256Hash = crypto.createHash('sha256').update(Buffer.from(compact, 'hex')).digest('hex')
  const hash = crypto.createHash('ripemd160').update(Buffer.from(sha256Hash, 'hex')).digest('hex')
  const words = bech32.toWords(Buffer.from(hash, 'hex'))
  return bech32.encode('tbnb', words)
}
