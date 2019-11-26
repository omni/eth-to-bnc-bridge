const assert = require('assert')

const createUser = require('./utils/user')
const { waitPromise, seqMap } = require('./utils/wait')

const testEthToBnc = require('./ethToBnc')
const testEthToBncWithRestart = require('./ethToBncWithRestart')
const testBncToEth = require('./bncToEth')
const testRemoveValidator = require('./removeValidator')
const testAddValidator = require('./addValidator')
const testChangeThreshold = require('./changeThreshold')

const usersConfig = require('../config').users
const validatorsConfig = require('../config').validators

const { HOME_PRIVATE_KEY, FOREIGN_PRIVATE_KEY, HOME_BRIDGE_ADDRESS } = process.env

const { controller1 } = require('./utils/proxyController')

describe('bridge tests', function () {
  let users
  let bncPrefundedUser
  let ethPrefundedUser

  before(async function () {
    ethPrefundedUser = await createUser(HOME_PRIVATE_KEY, 'eth')
    bncPrefundedUser = await createUser(FOREIGN_PRIVATE_KEY, 'bnc')

    for (let i = 0; i < 3; i += 1) {
      // user eth balance is already prefunded with 100 eth in genesis block
      await ethPrefundedUser.transferErc(usersConfig[i].ethAddress, 10000)
      await bncPrefundedUser.transferBepBnb(usersConfig[i].bncAddress, 10000, 100)
    }

    users = await seqMap(usersConfig, (user) => createUser(user.privateKey))
  })

  describe('generation of initial epoch keys', function () {
    let info

    it('should generate keys', async function () {
      this.timeout(120000)
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.epoch === 1)
    })

    it('should start correct epoch', async function () {
      assert.deepStrictEqual(info.validators, validatorsConfig, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, validatorsConfig, 'Next validators are not set correctly')
      assert.strictEqual(info.closeEpoch, true, 'Current close epoch is not set correctly')
      assert.strictEqual(info.nextCloseEpoch, true, 'Next close epoch is not set correctly')
      assert.strictEqual(info.threshold, 2, 'Threshold not set correctly')
      assert.strictEqual(info.nextThreshold, 2, 'Next threshold is not set correctly')
    })

    after(async function () {
      await bncPrefundedUser.transferBepBnb(info.foreignBridgeAddress, 1000, 50)
      await ethPrefundedUser.transferErc(HOME_BRIDGE_ADDRESS, 1000)
    })
  })

  testEthToBnc(() => users)
  testBncToEth(() => users)
  testEthToBnc(() => users)

  testRemoveValidator(validatorsConfig[1])

  testEthToBnc(() => users, 500, () => bncPrefundedUser)
  testBncToEth(() => users)
  testEthToBnc(() => users)

  testAddValidator(() => users, validatorsConfig[1])

  testEthToBnc(() => users)
  testBncToEth(() => users)
  testEthToBncWithRestart(() => users)

  testChangeThreshold(3)

  testEthToBnc(() => users)
  testBncToEth(() => users)
  testEthToBncWithRestart(() => users)
  testEthToBnc(() => users)
})
