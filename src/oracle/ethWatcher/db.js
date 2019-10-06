const Redis = require('ioredis')

console.log('Connecting to redis')

const redis = new Redis({
  port: 6379,
  host: 'redis',
  family: 4,
  db: 0
})

redis.on('connect', () => {
  console.log('Connected to redis')
})

redis.on('error', () => {
  console.log('Redis error')
})

module.exports = redis
