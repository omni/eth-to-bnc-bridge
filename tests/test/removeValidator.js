const assert = require('assert')

const { waitPromise, delay } = require('./utils/wait')
const { getBepBalance, getBncFlags } = require('./utils/bncController')

const { controller1, controller2, controller3 } = require('./utils/proxyController')

module.exports = (oldValidator) => {
  describe('remove validator', function () {
    let info
    let initialInfo
    let nextValidators

    before(async function () {
      initialInfo = await controller1.getInfo()
      info = initialInfo
      nextValidators = initialInfo.validators.filter((validator) => validator !== oldValidator)
    })

    it('should start closing epoch process', async function () {
      await controller1.voteStartVoting()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'ready', 'Should not change state after one vote')

      await controller2.voteStartVoting()
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.bridgeStatus === 'closing_epoch')
      assert.strictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Next validators are not set correctly')

      await controller3.voteStartVoting()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'closing_epoch', 'Should not do anything after third vote')
      assert.strictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Incorrect set of next validators after third vote')
    })

    it('should finish close epoch process and start voting process', async function () {
      this.timeout(120000)
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.bridgeStatus === 'voting')
      const flags = await getBncFlags(initialInfo.foreignBridgeAddress)
      assert.strictEqual(flags, 1, 'Foreign bridge flags are not set correctly')
    })

    it('should remove validator', async function () {
      await controller1.voteRemoveValidator(oldValidator)
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not change state after one vote')
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, initialInfo.validators, 'Next validators are not set correctly')

      await controller2.voteRemoveValidator(oldValidator)
      info = await waitPromise(
        controller1.getInfo,
        (newInfo) => newInfo.nextValidators.length === nextValidators.length
      )
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, nextValidators, 'Next validators are not set correctly')

      await controller3.voteRemoveValidator(oldValidator)
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not do anything after third vote')
      assert.strictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, nextValidators, 'Incorrect set of next validators after third vote')
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
      assert.deepStrictEqual(info.nextValidators, nextValidators, 'Incorrect set of next validators after third vote')
    })

    it('should finish keygen process and start funds transfer', async function () {
      this.timeout(120000)
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.bridgeStatus === 'funds_transfer')
    })

    it('should transfer all funds to new account and start new epoch', async function () {
      this.timeout(300000)
      info = await waitPromise(
        controller1.getInfo,
        (newInfo) => newInfo.epoch === initialInfo.epoch + 1
      )
      assert.deepStrictEqual(info.validators, nextValidators, 'Incorrect set of validators in new epoch')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Incorrect next epoch')
      assert.strictEqual(info.bridgeStatus, 'ready', 'Incorrect bridge state in new epoch')
      await delay(5000)
      const prevBalance = await getBepBalance(initialInfo.foreignBridgeAddress)
      const newBalance = await getBepBalance(info.foreignBridgeAddress)
      assert.strictEqual(prevBalance, 0, 'Did not transfer all funds')
      assert.strictEqual(newBalance, initialInfo.foreignBalanceTokens, 'Funds are lost somewhere')
    })
  })
}
