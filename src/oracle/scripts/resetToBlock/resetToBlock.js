const Redis = require('ioredis')

const redis = new Redis({
  port: 6379,
  host: 'redis',
  family: 4,
  db: 0
})

redis.on('error', () => {
  console.log('Error: Cannot connect to redis')
})

redis.on('connect', async () => {
  await redis.set('homeBlock', parseInt(process.argv[2], 10))
  await redis.save()
  redis.disconnect()
})
