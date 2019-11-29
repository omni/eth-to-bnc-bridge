const assert = require('assert')

const { waitPromise } = require('./utils/wait')
const { controller1, controller2, controller3 } = require('./utils/proxyController')

module.exports = () => {
  describe('cancel keygen', function () {
    let info
    let initialInfo

    before(async function () {
      initialInfo = await controller1.getInfo()
      info = initialInfo
    })

    it('should start voting process', async function () {
      await controller1.voteStartVoting()
      await controller2.voteStartVoting()
      await controller3.voteStartVoting()
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.bridgeStatus === 'voting')
    })

    it('should start keygen process', async function () {
      await controller1.voteStartKeygen()
      await controller2.voteStartKeygen()
      await controller3.voteStartKeygen()
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.bridgeStatus === 'keygen')
    })

    it('should cancel keygen process', async function () {
      await controller1.voteCancelKeygen()
      await controller2.voteCancelKeygen()
      await controller3.voteCancelKeygen()
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.bridgeStatus === 'voting')
      assert.strictEqual(info.epoch, initialInfo.epoch, 'Current epoch is not set correctly')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Next epoch is not set correctly')
    })

    it('should start keygen again', async function () {
      await controller1.voteStartKeygen(1)
      await controller2.voteStartKeygen(1)
      await controller3.voteStartKeygen(1)
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.bridgeStatus === 'keygen')
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
      assert.deepStrictEqual(info.validators, initialInfo.validators, 'Incorrect set of validators in new epoch')
      assert.strictEqual(info.nextEpoch, initialInfo.epoch + 1, 'Incorrect next epoch')
      assert.strictEqual(info.bridgeStatus, 'ready', 'Incorrect bridge state in new epoch')
    })
  })
}
