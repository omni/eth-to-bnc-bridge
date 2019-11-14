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
    async voteStartKeygen() {
      return (await retry(() => proxy.get('/vote/startKeygen'))).data
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
    }
  }
}

module.exports = {
  controller1: createController(1),
  controller2: createController(2),
  controller3: createController(3)
}
