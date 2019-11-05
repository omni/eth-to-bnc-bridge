const axios = require('axios')

function createController(validatorId) {
  const url = `http://validator${validatorId}_signer_1:8001/`

  const sideClient = axios.create({
    baseURL: url,
    timeout: 10000
  })

  return {
    async restart(attempt) {
      return (await sideClient.get(`/restart/${attempt}`)).data
    }
  }
}

module.exports = {
  signerController1: createController(1),
  signerController2: createController(2),
  signerController3: createController(3)
}
