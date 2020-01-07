const axios = require('axios')

const { retry } = require('./wait')

function createController(validatorId) {
  const url = `http://validator${validatorId}_proxy_1:8002/`

  const proxy = axios.create({
    baseURL: url,
    timeout: 10000
  })

  return {
    async getInfo() {
      return (await retry(() => proxy.get('/info'))).data
    },
    async voteStartVoting() {
      return (await retry(() => proxy.get('/vote/startVoting'))).data
    },
    async voteStartKeygen(attempt = 0) {
      return (await retry(() => proxy.get('/vote/startKeygen', {
        params: { attempt }
      }))).data
    },
    async voteAddValidator(validatorAddress) {
      return (await retry(() => proxy.get(`/vote/addValidator/${validatorAddress}`))).data
    },
    async voteRemoveValidator(validatorAddress) {
      return (await retry(() => proxy.get(`/vote/removeValidator/${validatorAddress}`))).data
    },
    async voteChangeThreshold(threshold) {
      return (await retry(() => proxy.get(`/vote/changeThreshold/${threshold}`))).data
    },
    async voteChangeCloseEpoch(closeEpoch) {
      return (await retry(() => proxy.get(`/vote/changeCloseEpoch/${closeEpoch}`))).data
    },
    async voteCancelKeygen() {
      return (await retry(() => proxy.get('/vote/cancelKeygen'))).data
    },
    async voteChangeRangeSize(rangeSize) {
      return (await retry(() => proxy.get(`/vote/changeRangeSize/${rangeSize}`))).data
    },
    async voteChangeMinPerTxLimit(limit) {
      return (await retry(() => proxy.get(`/vote/changeMinPerTxLimit/${limit}`))).data
    },
    async voteChangeMaxPerTxLimit(limit) {
      return (await retry(() => proxy.get(`/vote/changeMaxPerTxLimit/${limit}`))).data
    },
    async voteDecreaseExecutionMinLimit(limit) {
      return (await retry(() => proxy.get(`/vote/decreaseExecutionMinLimit/${limit}`))).data
    },
    async voteIncreaseExecutionMaxLimit(limit) {
      return (await retry(() => proxy.get(`/vote/increaseExecutionMaxLimit/${limit}`))).data
    }
  }
}

module.exports = {
  controller1: createController(1),
  controller2: createController(2),
  controller3: createController(3)
}
