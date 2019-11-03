const logger = require('./logger')

async function delay(ms) {
  await new Promise((res) => setTimeout(res, ms))
}

async function retry(getPromise, n = -1, sleep = 3000) {
  while (n) {
    try {
      return await getPromise()
    } catch (e) {
      logger.debug(`Promise failed, retrying, ${n - 1} attempts left`)
      await delay(sleep)
      // eslint-disable-next-line no-param-reassign
      n -= 1
    }
  }
  return null
}

module.exports = {
  delay,
  retry
}
