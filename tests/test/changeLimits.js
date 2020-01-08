const { waitPromise } = require('./utils/wait')
const { controller1, controller2, controller3 } = require('./utils/proxyController')

module.exports = () => {
  describe('change per tx limits', function () {
    it('should change min per tx limit', async function () {
      await controller1.voteChangeMinPerTxLimit('0.01')
      await controller2.voteChangeMinPerTxLimit('0.01')
      await controller3.voteChangeMinPerTxLimit('0.01')

      await waitPromise(controller1.getInfo, (newInfo) => newInfo.minPerTxLimit === 0.01)
    })

    it('should change min per tx limit', async function () {
      await controller1.voteChangeMaxPerTxLimit('1001')
      await controller2.voteChangeMaxPerTxLimit('1001')
      await controller3.voteChangeMaxPerTxLimit('1001')

      await waitPromise(controller1.getInfo, (newInfo) => newInfo.maxPerTxLimit === 1001)
    })
  })
  describe('change execution limits', function () {
    it('should change execution min limit', async function () {
      await controller1.voteDecreaseExecutionMinLimit('0.01')
      await controller2.voteDecreaseExecutionMinLimit('0.01')
      await controller3.voteDecreaseExecutionMinLimit('0.01')

      await waitPromise(controller1.getInfo, (newInfo) => newInfo.executionMinLimit === 0.01)
    })

    it('should change execution max limit', async function () {
      await controller1.voteIncreaseExecutionMaxLimit('1001')
      await controller2.voteIncreaseExecutionMaxLimit('1001')
      await controller3.voteIncreaseExecutionMaxLimit('1001')

      await waitPromise(controller1.getInfo, (newInfo) => newInfo.executionMaxLimit === 1001)
    })
  })
}
