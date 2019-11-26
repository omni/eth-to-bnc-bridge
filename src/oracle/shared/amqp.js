const amqp = require('amqplib')

const logger = require('./logger')
const { retry } = require('./wait')

async function connectRabbit(url) {
  logger.info('Connecting to RabbitMQ server')
  return (await retry(() => amqp.connect(url))).createChannel()
}

async function assertQueue(channel, name) {
  const queue = await channel.assertQueue(name)
  return {
    name: queue.queue,
    send: (msg) => channel.sendToQueue(queue.queue, Buffer.from(JSON.stringify(msg)), {
      persistent: true
    }),
    get: (consumer) => channel.get(queue.queue, consumer),
    consume: (consumer) => channel.consume(queue.queue, consumer)
  }
}

module.exports = {
  connectRabbit,
  assertQueue
}
