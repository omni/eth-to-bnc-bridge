const axios = require('axios')

const { retry } = require('./wait')

const { FOREIGN_URL, FOREIGN_ASSET } = process.env

const bnc = axios.create({
  baseURL: FOREIGN_URL,
  timeout: 10000
})

module.exports = {
  async getBnbBalance(address) {
    const response = await retry(() => bnc.get(`/api/v1/account/${address}`))
    const tokens = response.data.balances.find((x) => x.symbol === 'BNB')
    return response && tokens ? parseFloat(tokens.free) : 0
  },
  async getBepBalance(address) {
    const response = await retry(() => bnc.get(`/api/v1/account/${address}`))
    const tokens = response.data.balances.find((x) => x.symbol === FOREIGN_ASSET)
    return response && tokens ? parseFloat(tokens.free) : 0
  },
  async getBncSequence(address) {
    const response = await retry(() => bnc.get(`/api/v1/account/${address}/sequence`))
    return response ? response.data.sequence : 0
  },
  async getBncFlags(address) {
    const response = await retry(() => bnc.get(`/api/v1/account/${address}`))
    return response.data.flags
  }
}
