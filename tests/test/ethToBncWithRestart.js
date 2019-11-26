const assert = require('assert')

const { getBncSequence } = require('./utils/bncController')
const { waitPromise, delay, seqMap } = require('./utils/wait')

const { controller1 } = require('./utils/proxyController')
const { getNonce } = require('./utils/sideController')
const { signerController1, signerController2 } = require('./utils/signerController')

const { validators } = require('../config')

const { HOME_BRIDGE_ADDRESS } = process.env

module.exports = (getUsers) => {
  describe('exchange of tokens in eth => bnc direction with restart', function () {
    let info
    let users
    let ethBalances
    let bncBalances
    let bncBridgeSequence
    let validatorNonces
    let newValidatorNonces

    before(async function () {
      users = getUsers()
      info = await controller1.getInfo()
      ethBalances = await Promise.all(users.map((user) => user.getErcBalance()))
      bncBalances = await seqMap(users, (user) => user.getBepBalance())
      validatorNonces = await Promise.all(validators.map(getNonce))

      bncBridgeSequence = await getBncSequence(info.foreignBridgeAddress)
      await Promise.all(users.map((user, i) => user.approveErc(HOME_BRIDGE_ADDRESS, 5 + i)))
    })

    it('should accept exchange requests', async function () {
      await Promise.all(users.map((user, i) => user.exchangeErc(5 + i)))
      const newEthBalances = await Promise.all(users.map((user) => user.getErcBalance()))
      for (let i = 0; i < 3; i += 1) {
        assert.strictEqual(newEthBalances[i], ethBalances[i] - 5 - i, `Balance of ${users[i].ethAddress} did not updated as expected`)
      }
    })

    it('should start signing transaction', async function () {
      this.timeout(120000)
      newValidatorNonces = await waitPromise(
        () => Promise.all(validators.map(getNonce)),
        (nonces) => nonces[0] > validatorNonces[0] + 2
          || nonces[1] > validatorNonces[1] + 2
          || nonces[2] > validatorNonces[2] + 2
      )
    })

    it('should restart signature generation and regenerate signature properly', async function () {
      this.timeout(360000)
      if (newValidatorNonces[0] > validatorNonces[0] + 2) {
        await signerController1.restart()
      } else {
        await signerController2.restart()
      }
      await waitPromise(
        () => getBncSequence(info.foreignBridgeAddress),
        (sequence) => sequence === bncBridgeSequence + 1
      )
    })

    it('should make correct exchange transaction', async function () {
      await delay(10000)
      const newBncBalances = await Promise.all(users.map((user) => user.getBepBalance()))
      for (let i = 0; i < 3; i += 1) {
        assert.strictEqual(newBncBalances[i], bncBalances[i] + 5 + i, `Balance of ${users[i].bncAddress} did not updated as expected`)
      }
    })
  })
}
