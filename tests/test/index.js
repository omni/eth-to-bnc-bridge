const createUser = require('./utils/user')
const { waitPromise } = require('./utils/wait')

const testEthToBnc = require('./ethToBnc')
const testBncToEth = require('./bncToEth')
const testRemoveValidator = require('./removeValidator')
const testAddValidator = require('./addValidator')
const testChangeThreshold = require('./changeThreshold')

const usersConfig = require('../config').users
const validatorsConfig = require('../config').validators

const { FOREIGN_PRIVATE_KEY } = process.env

const { controller1 } = require('./utils/proxyController')

describe('bridge tests', function () {
  let users

  before(async function () {
    users = await usersConfig.seqMap(user => createUser(user.privateKey))
  })

  describe('generation of initial epoch keys', function () {
    let info
    let foreignPrefundedUser

    before(async function () {
      foreignPrefundedUser = await createUser(FOREIGN_PRIVATE_KEY)
    })

    it('should generate keys', async function () {
      this.timeout(120000)
      info = await waitPromise(controller1.getInfo, info => info.epoch === 1)
    })

    after(async function () {
      await foreignPrefundedUser.transferBnc(info.foreignBridgeAddress, 50, 0.1)
    })
  })

  testEthToBnc(() => users)
  testBncToEth(() => users)

  testRemoveValidator(validatorsConfig[1])

  testEthToBnc(() => users)
  testBncToEth(() => users)

  testAddValidator(validatorsConfig[1])

  testEthToBnc(() => users)
  testBncToEth(() => users)

  testChangeThreshold(2)

  testEthToBnc(() => users)
  testBncToEth(() => users)
})
