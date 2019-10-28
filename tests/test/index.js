const createController = require('./utils/proxyController')
const createUser = require('./utils/user')
const { waitPromise } = require('./utils/wait')

const testEthToBnc = require('./ethToBnc')
const testBncToEth = require('./bncToEth')

const usersConfig = require('../config').users

const { FOREIGN_PRIVATE_KEY } = process.env

let { getInfo } = createController(1)

describe('bridge tests', function () {
  let users
  let foreignPrefundedUser
  let info

  before(async function() {
    this.timeout(60000)
    users = await usersConfig.seqMap(user => createUser(user.privateKey))
  })

  describe('generation of initial epoch keys', function () {
    before(async function () {
      this.timeout(60000)
      foreignPrefundedUser = await createUser(FOREIGN_PRIVATE_KEY)
    })

    it('should generate keys', async function () {
      this.timeout(120000)
      info = await waitPromise(getInfo, info => info.epoch === 1)
    })

    after(async function () {
      this.timeout(60000)
      await foreignPrefundedUser.transferBnc(info.foreignBridgeAddress, 50, 0.1)
    })
  })

  testEthToBnc(() => users, () => info.foreignBridgeAddress)
  testBncToEth(() => users, () => info.foreignBridgeAddress)
})
