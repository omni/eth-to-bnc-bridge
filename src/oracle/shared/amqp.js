const amqp = require('amqplib')

const logger = require('./logger')

async function connectRabbit(url) {
  while (true) {
    try {
      return (await amqp.connect(url)).createChannel()
    } catch (e) {
      logger.debug('Failed to connect to rabbitmqServer, reconnecting')
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
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
