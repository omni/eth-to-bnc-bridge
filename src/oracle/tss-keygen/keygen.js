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
  const channel = await connection.createChannel()
  const queue = await channel.assertQueue('epochQueue')

  let prev
  let cmd

  channel.prefetch(2)
  channel.consume(queue.queue, msg => {
    if (prev) {
      const t = prev
      prev = msg
      channel.ack(t)
    }
    if (cmd) {
      cmd.kill()
    }
    const data = JSON.parse(msg.content)
    console.log(`Consumed new epoch event, starting keygen for epoch ${data.epoch}`)

    const keysFile = `/keys/keys${data.epoch}.store`

    console.log('Running ./keygen-entrypoint.sh')
    cmd = exec.execFile('./keygen-entrypoint.sh', [PROXY_URL, keysFile], async () => {
      cmd = null
      if (fs.existsSync(keysFile)) {
        console.log(`Finished keygen for epoch ${data.epoch}`)
        const publicKey = JSON.parse(fs.readFileSync(keysFile))[5]
        console.log(`Generated multisig account in binance chain: ${publicKeyToAddress(publicKey)}`)
        if (data.epoch === 1) {
          console.log('Sending keys confirmation on first generated epoch')
          await confirm(keysFile)
        }
      }
      else {
        console.log(`Keygen for epoch ${data.epoch} failed`)
      }
      prev = null
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

async function confirm (keysFile) {
  exec.execSync(`curl -X POST -H "Content-Type: application/json" -d @"${keysFile}" "${PROXY_URL}/confirm"`, { stdio: 'pipe' })
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
