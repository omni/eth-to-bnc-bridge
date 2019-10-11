const amqp = require('amqplib')

const logger = require('./logger')

function _connectRabbit (url) {
  return amqp.connect(url).catch(() => {
    logger.debug('Failed to connect to rabbitmqServer, reconnecting')
    return new Promise(resolve =>
      setTimeout(() => resolve(_connectRabbit(url)), 2000)
    )
  })
}

async function connectRabbit(url) {
  const connection = await _connectRabbit(url)
  return await connection.createChannel()
}

async function assertQueue (channel, name) {
  const queue = await channel.assertQueue(name)
  return {
    name: queue.queue,
    send: msg => channel.sendToQueue(queue.queue, Buffer.from(JSON.stringify(msg)), {
      persistent: true
    }),
    get: consumer => channel.get(queue.queue, consumer),
    consume: consumer => channel.consume(queue.queue, consumer)
  }
}

module.exports = { connectRabbit, assertQueue }
