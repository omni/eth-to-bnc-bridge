const Redis = require('ioredis')

const logger = require('./logger')

logger.info('Connecting to redis')

const redis = new Redis({
  port: 6379,
  host: 'redis',
  family: 4,
  db: 0
})

redis.on('connect', () => {
  logger.info('Connected to redis')
})

redis.on('error', (e) => {
  logger.warn('Redis error %o', e)
})

module.exports = redis
