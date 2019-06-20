import Redis from 'ioredis'
import { redis as redisConfig } from 'config'

console.log('Connecting to redis')

const redis = Redis(redisConfig)

redis.on('connect', () => {
  console.log('Connected to redis')
})

redis.on('error', () => {
  console.log('Redis error')
})

export const get = redis.get
export const set = redis.set
