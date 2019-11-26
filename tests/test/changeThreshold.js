const assert = require('assert')

const { waitPromise, delay } = require('./utils/wait')
const { getBepBalance, getBncFlags } = require('./utils/bncController')
const { getNonce } = require('./utils/sideController')
const { controller1, controller2, controller3 } = require('./utils/proxyController')
const { keygenController1 } = require('./utils/keygenController')

const { validators } = require('../config')

module.exports = (newThreshold) => {
  describe('change threshold', function () {
    let info
    let initialInfo
    let validatorNonce

    before(async function () {
      initialInfo = await controller1.getInfo()
      validatorNonce = await getNonce(validators[0])
      info = initialInfo
    })

    it('should start voting process', async function () {
      await controller1.voteStartVoting()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'ready', 'Should not change state after one vote')

      await controller2.voteStartVoting()
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.bridgeStatus === 'closingEpoch' || newInfo.bridgeStatus === 'voting')
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not started closing epoch after previous epoch')
      assert.strictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Next validators are not set correctly')

      await controller3.voteStartVoting()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not do anything after third vote')
      assert.strictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Incorrect set of next validators after third vote')
    })

    it('should change threshold', async function () {
      await controller1.voteChangeThreshold(newThreshold)
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not change state after one vote')
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Next validators are not set correctly')
      assert.strictEqual(info.threshold, initialInfo.threshold, 'Threshold not set correctly')
      assert.strictEqual(info.nextThreshold, initialInfo.threshold, 'Next threshold is not set correctly')

      await controller2.voteChangeThreshold(newThreshold)
      info = await waitPromise(
        controller1.getInfo,
        (newInfo) => newInfo.nextThreshold === newThreshold
      )
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Next validators are not set correctly')
      assert.strictEqual(info.threshold, initialInfo.threshold, 'Threshold not set correctly')

      await controller3.voteChangeThreshold(newThreshold)
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not do anything after third vote')
      assert.strictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Incorrect set of next validators after third vote')
      assert.strictEqual(info.threshold, initialInfo.threshold, 'Threshold not set correctly')
      assert.strictEqual(info.nextThreshold, newThreshold, 'Next threshold is not set correctly')
    })

    it('should start keygen process', async function () {
      await controller1.voteStartKeygen()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not change state after one vote')

      await controller2.voteStartKeygen()
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.bridgeStatus === 'keygen')

      await controller3.voteStartKeygen()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'keygen', 'Should not do anything after third vote')
      assert.strictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Incorrect set of next validators after third vote')
      assert.strictEqual(info.threshold, initialInfo.threshold, 'Threshold not set correctly')
      assert.strictEqual(info.nextThreshold, newThreshold, 'Next threshold is not set correctly')
    })

    it('should start keys generation', async function () {
      this.timeout(120000)
      await waitPromise(
        () => getNonce(validators[0]),
        (nonce) => nonce > validatorNonce + 2
      )
    })

    it('should restart keygen generation and regenerate keys properly, should start funds transfer', async function () {
      this.timeout(360000)
      await keygenController1.restart()
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.bridgeStatus === 'funds_transfer')
      const flags = await getBncFlags(initialInfo.foreignBridgeAddress)
      assert.strictEqual(flags, 0, 'Foreign bridge flags are not set correctly')
    })

    it('should transfer all funds to new account and start new epoch', async function () {
      this.timeout(300000)
      info = await waitPromise(
        controller1.getInfo,
        (newInfo) => newInfo.epoch === initialInfo.epoch + 1
      )
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Incorrect set of validators in new epoch')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Incorrect next epoch')
      assert.strictEqual(info.bridgeStatus, 'ready', 'Incorrect bridge state in new epoch')
      assert.strictEqual(info.threshold, newThreshold, 'Threshold not set correctly')
      assert.strictEqual(info.nextThreshold, newThreshold, 'Next threshold is not set correctly')
      await delay(5000)
      const prevBalance = await getBepBalance(initialInfo.foreignBridgeAddress)
      const newBalance = await getBepBalance(info.foreignBridgeAddress)
      assert.strictEqual(prevBalance, 0, 'Did not transfer all funds')
      assert.strictEqual(newBalance, initialInfo.foreignBalanceTokens, 'Funds are lost somewhere')
    })
  })
}
