const assert = require('assert')
const { getSequence } = require('./utils/bncController')
const { waitPromise } = require('./utils/wait')

const usersConfig = require('../config').users

const { HOME_BRIDGE_ADDRESS } = process.env

module.exports = (usersFunc, foreignBridgeAddressFunc) => {
  describe('exchange of tokens in eth => bnc direction', function () {
    let users
    let foreignBridgeAddress
    let ethBalances
    let bncBalances
    let bncBridgeSequence

    before(async function () {
      this.timeout(60000)
      users = usersFunc()
      foreignBridgeAddress = foreignBridgeAddressFunc()
      ethBalances = await Promise.all(users.map(user => user.getEthBalance()))
      bncBalances = await users.seqMap(user => user.getBncBalance())

      bncBridgeSequence = await getSequence(foreignBridgeAddress)
      await Promise.all(users.map((user, i) => user.approveEth(HOME_BRIDGE_ADDRESS, 5 + i)))
    })

    it('should accept exchange requests', async function () {
      this.timeout(60000)
      await Promise.all(users.map((user, i) => user.exchangeEth(5 + i)))
      const newEthBalances = await Promise.all(users.map(user => user.getEthBalance()))
      for (let i = 0; i < 3; i++) {
        assert(newEthBalances[i] === ethBalances[i] - 5 - i, `Balance of ${usersConfig[i].ethAddress} did not updated as expected`)
      }
    })

    it('should make exchange transaction on bnc side', async function () {
      this.timeout(300000)
      await waitPromise(() => getSequence(foreignBridgeAddress), sequence => sequence === bncBridgeSequence + 1)
    })

    it('should make correct exchange transaction', async function () {
      this.timeout(60000)
      const newBncBalances = await Promise.all(users.map(user => user.getBncBalance()))
      for (let i = 0; i < 3; i++) {
        assert(newBncBalances[i] === bncBalances[i] + 5 + i, `Balance of ${usersConfig[i].bncAddress} did not updated as expected`)
      }
    })
  })
}
