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

async function resetFutureMessages(channel, queue, blockNumber) {
  logger.debug(`Resetting future messages in queue ${queue.name}`)
  const { messageCount } = await channel.checkQueue(queue.name)
  if (messageCount) {
    logger.info(`Filtering ${messageCount} reloaded messages from queue ${queue.name}`)
    const backup = await assertQueue(channel, `${queue.name}.backup`)
    while (true) {
      const message = await queue.get()
      if (message === false) {
        break
      }
      const data = JSON.parse(message.content)
      if (data.blockNumber < blockNumber) {
        logger.debug('Saving message %o', data)
        backup.send(data)
      } else {
        logger.debug('Dropping message %o', data)
      }
      channel.ack(message)
    }

    logger.debug('Dropped messages came from future')

    while (true) {
      const message = await backup.get()
      if (message === false) {
        break
      }
      const data = JSON.parse(message.content)
      logger.debug('Requeuing message %o', data)
      queue.send(data)
      channel.ack(message)
    }

    logger.debug('Redirected messages back to initial queue')
  }
}

module.exports = {
  connectRabbit,
  assertQueue,
  resetFutureMessages
}
