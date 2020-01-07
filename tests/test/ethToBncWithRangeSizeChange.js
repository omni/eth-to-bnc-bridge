const assert = require('assert')

const { getBncSequence } = require('./utils/bncController')
const { waitPromise, delay, seqMap } = require('./utils/wait')

const { HOME_BRIDGE_ADDRESS } = process.env

const { controller1, controller2, controller3 } = require('./utils/proxyController')

module.exports = (getUsers, amount = 5) => {
  describe('exchange of tokens in eth => bnc direction with range size change', function () {
    let info
    let users
    let ethBalances
    let bncBalances
    let bncBridgeSequence

    before(async function () {
      users = getUsers()
      info = await controller1.getInfo()
      ethBalances = await Promise.all(users.map((user) => user.getErcBalance()))
      bncBalances = await seqMap(users, (user) => user.getBepBalance())
      bncBridgeSequence = await getBncSequence(info.foreignBridgeAddress)
      await Promise.all(users.map((user, i) => user.approveErc(HOME_BRIDGE_ADDRESS, amount + i)))
    })

    it('should accept exchange requests', async function () {
      await Promise.all(users.map((user, i) => user.exchangeErc(amount + i)))
      const newEthBalances = await Promise.all(users.map((user) => user.getErcBalance()))
      for (let i = 0; i < 3; i += 1) {
        assert.strictEqual(newEthBalances[i], ethBalances[i] - amount - i, `Balance of ${users[i].ethAddress} did not updated as expected`)
      }
    })

    it('should change range size to 11', async function () {
      await controller1.voteChangeRangeSize(11)
      await controller2.voteChangeRangeSize(11)
      await controller3.voteChangeRangeSize(11)
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.rangeSize === 11)
    })

    it('should make exchange transaction on bnc side', async function () {
      this.timeout(300000)
      await waitPromise(
        () => getBncSequence(info.foreignBridgeAddress),
        (sequence) => sequence === bncBridgeSequence + 1
      )
    })

    it('should make correct exchange transaction', async function () {
      await delay(10000)
      const newBncBalances = await Promise.all(users.map((user) => user.getBepBalance()))
      for (let i = 0; i < 3; i += 1) {
        assert.strictEqual(newBncBalances[i], bncBalances[i] + amount + i, `Balance of ${users[i].bncAddress} did not updated as expected`)
      }
    })
  })
}
