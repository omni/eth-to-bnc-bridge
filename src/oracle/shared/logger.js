const pino = require('pino')

const logger = pino({
  name: 'logger',
  prettyPrint: {
    colorize: true,
    ignore: 'time,pid,name,hostname'
  },
  level: process.env.LOG_LEVEL || 'debug',
  base: {}
})

module.exports = logger
