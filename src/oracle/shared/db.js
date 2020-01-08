const Redis = require('ioredis')

const { REDIS_HOST } = process.env

const logger = require('./logger')

logger.info('Connecting to redis')

const redis = new Redis(6379, REDIS_HOST)

redis.on('connect', () => {
  logger.info('Connected to redis')
})

redis.on('error', (e) => {
  logger.warn('Redis error %o', e)
})

module.exports = redis
