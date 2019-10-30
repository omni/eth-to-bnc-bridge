const axios = require('axios')

function createController (validatorId) {
  const url = `http://validator${validatorId}_proxy_1:8002/`

  const proxy = axios.create({
    baseURL: url,
    timeout: 10000
  })

  return {
    getInfo: async function () {
      return (await proxy.get('/info')).data
    },
    voteStartVoting: async function () {
      return (await proxy.get('/vote/startVoting')).data
    },
    voteStartKeygen: async function () {
      return (await proxy.get('/vote/startKeygen')).data
    },
    voteAddValidator: async function (validatorAddress) {
      return (await proxy.get(`/vote/addValidator/${validatorAddress}`)).data
    },
    voteRemoveValidator: async function (validatorAddress) {
      return (await proxy.get(`/vote/removeValidator/${validatorAddress}`)).data
    },
    voteChangeThreshold: async function (threshold) {
      return (await proxy.get(`/vote/changeThreshold/${threshold}`)).data
    }
  }
}

module.exports = {
  controller1: createController(1),
  controller2: createController(2),
  controller3: createController(3)
}
