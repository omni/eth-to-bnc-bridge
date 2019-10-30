const axios = require('axios')

const { FOREIGN_URL, FOREIGN_ASSET } = process.env

const bnc = axios.create({
  baseURL: FOREIGN_URL,
  timeout: 15000
})

module.exports = {
  getBalance: async function (address) {
    try {
      const response = await bnc.get(`/api/v1/account/${address}`)

      return parseFloat(response.data.balances.find(x => x.symbol === FOREIGN_ASSET).free)
    } catch (e) {
      return 0
    }
  },
  getSequence: async function(address) {
    try {
      const response = await bnc.get(`/api/v1/account/${address}/sequence`)

      return response.data.sequence
    } catch (e) {
      return 0
    }
  }
}
