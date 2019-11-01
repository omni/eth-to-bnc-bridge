async function delay(ms) {
  await new Promise(res => setTimeout(res, ms))
}

async function waitPromise (getPromise, checker) {
  do {
    const result = await getPromise()
    if (checker(result))
      return result
    await delay(1000)
  } while (true)
}

async function retry (n, getPromise) {
  while (n) {
    try {
      return await getPromise()
    } catch (e) {
      await delay(3000)
      n--
    }
  }
  return null
}

Array.prototype.seqMap = async function (transition) {
  const results = []
  for (let i = 0; i < this.length; i++) {
    results[i] = await transition(this[i])
  }
  return results
}

module.exports = {
  waitPromise,
  delay,
  retry
}
