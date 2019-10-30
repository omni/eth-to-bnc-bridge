const assert = require('assert')

const { waitPromise, delay } = require('./utils/wait')
const { getBalance } = require('./utils/bncController')

const { controller1, controller2, controller3 } = require('./utils/proxyController')

module.exports = newThreshold => {
  describe('change threshold', function () {
    let info
    let initialInfo

    before(async function () {
      initialInfo = info = await controller1.getInfo()
    })

    it('should start voting process', async function () {
      await controller1.voteStartVoting()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'ready', 'Should not change state after one vote')

      await controller2.voteStartVoting()
      info = await waitPromise(controller1.getInfo, info => info.bridgeStatus === 'voting')
      assert.deepStrictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.deepStrictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Next validators are not set correctly')

      await controller3.voteStartVoting()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not do anything after third vote')
      assert.deepStrictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.deepStrictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Incorrect set of next validators after third vote')
    })

    it('should change threshold', async function () {
      await controller1.voteChangeThreshold(newThreshold)
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not change state after one vote')
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Next validators are not set correctly')
      assert.deepStrictEqual(info.threshold, initialInfo.threshold, 'Threshold not set correctly')
      assert.deepStrictEqual(info.nextThreshold, initialInfo.threshold, 'Next threshold is not set correctly')

      await controller2.voteChangeThreshold(newThreshold)
      info = await waitPromise(controller1.getInfo, info => info.nextThreshold === newThreshold)
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Next validators are not set correctly')
      assert.deepStrictEqual(info.threshold, initialInfo.threshold, 'Threshold not set correctly')

      await controller3.voteChangeThreshold(newThreshold)
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not do anything after third vote')
      assert.deepStrictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.deepStrictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Incorrect set of next validators after third vote')
      assert.deepStrictEqual(info.threshold, initialInfo.threshold, 'Threshold not set correctly')
      assert.deepStrictEqual(info.nextThreshold, newThreshold, 'Next threshold is not set correctly')
    })

    it('should start keygen process', async function () {
      await controller1.voteStartKeygen()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not change state after one vote')

      await controller2.voteStartKeygen()
      info = await waitPromise(controller1.getInfo, info => info.bridgeStatus === 'keygen')

      await controller3.voteStartKeygen()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'keygen', 'Should not do anything after third vote')
      assert.deepStrictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.deepStrictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Incorrect set of next validators after third vote')
      assert.deepStrictEqual(info.threshold, initialInfo.threshold, 'Threshold not set correctly')
      assert.deepStrictEqual(info.nextThreshold, newThreshold, 'Next threshold is not set correctly')
    })

    it('should finish keygen process and start funds transfer', async function () {
      this.timeout(120000)
      info = await waitPromise(controller1.getInfo, info => info.bridgeStatus === 'funds_transfer')
    })

    it('should transfer all funds to new account and start new epoch', async function () {
      this.timeout(300000)
      info = await waitPromise(controller1.getInfo, info => info.epoch === initialInfo.epoch + 1)
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Incorrect set of validators in new epoch')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Incorrect next epoch')
      assert.strictEqual(info.bridgeStatus, 'ready', 'Incorrect bridge state in new epoch')
      assert.deepStrictEqual(info.threshold, newThreshold, 'Threshold not set correctly')
      assert.deepStrictEqual(info.nextThreshold, newThreshold, 'Next threshold is not set correctly')
      await delay(5000)
      const prevBalance = await getBalance(initialInfo.foreignBridgeAddress)
      const newBalance = await getBalance(info.foreignBridgeAddress)
      assert.strictEqual(prevBalance, 0, 'Did not transfer all funds')
      assert.strictEqual(newBalance, initialInfo.foreignBalanceTokens, 'Funds are lost somewhere')
    })
  })
}
