const axios = require('axios')

function createController(validatorId) {
  const url = `http://validator${validatorId}_keygen_1:8001/`

  const keygenClient = axios.create({
    baseURL: url,
    timeout: 10000
  })

  return {
    async restart() {
      await keygenClient.get('/restart')
    }
  }
}

module.exports = {
  keygenController1: createController(1),
  keygenController2: createController(2),
  keygenController3: createController(3)
}
