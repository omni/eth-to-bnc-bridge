const axios = require('axios')

const { FOREIGN_URL, FOREIGN_ASSET } = process.env

const address = process.argv[2]
const httpClient = axios.create({ baseURL: FOREIGN_URL })

function main() {
  httpClient
    .get(`/api/v1/account/${address}`)
    .then((res) => {
      console.log(`BNB: ${parseFloat(res.data.balances.find((token) => token.symbol === 'BNB').free)}`)
      console.log(`${FOREIGN_ASSET}: ${parseFloat(res.data.balances.find((token) => token.symbol === FOREIGN_ASSET).free)}`)
    })
    .catch(console.log)
}

main()
