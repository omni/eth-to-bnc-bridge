const Web3 = require('web3')
const { users } = require('../config')

const web3 = new Web3(process.env.HOME_RPC_URL)

describe('check balance', function () {
  it('should have correct balance', async function () {
    const balance = await web3.eth.getBalance(users[0].ethAddress)
    console.log(balance.toNumber())
    return 0
  })
})
