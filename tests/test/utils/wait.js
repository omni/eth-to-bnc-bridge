async function delay(ms) {
  await new Promise((res) => setTimeout(res, ms))
}

async function waitPromise(getPromise, checker) {
  while (true) {
    const result = await getPromise()
    if (checker(result)) {
      return result
    }
    await delay(1000)
  }
}

async function retry(getPromise, n = -1, sleep = 3000) {
  while (n) {
    try {
      return await getPromise()
    } catch (e) {
      await delay(sleep)
      // eslint-disable-next-line no-param-reassign
      n -= 1
    }
  }
  return null
}

async function seqMap(arr, transition) {
  const results = []
  for (let i = 0; i < arr.length; i += 1) {
    results[i] = await transition(arr[i])
  }
  return results
}

module.exports = {
  waitPromise,
  delay,
  retry,
  seqMap
}
