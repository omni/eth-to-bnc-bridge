const axios = require('axios')

const { retry } = require('./wait')

const { FOREIGN_URL, FOREIGN_ASSET } = process.env

const bnc = axios.create({
  baseURL: FOREIGN_URL,
  timeout: 15000
})

module.exports = {
  async getBalance(address) {
    const response = await retry(() => bnc.get(`/api/v1/account/${address}`), 5)
    const tokens = response.data.balances.find((x) => x.symbol === FOREIGN_ASSET)
    return response && tokens ? parseFloat(tokens.free) : 0
  },
  async getSequence(address) {
    const response = await retry(() => bnc.get(`/api/v1/account/${address}/sequence`), 5)
    return response ? response.data.sequence : 0
  }
}
