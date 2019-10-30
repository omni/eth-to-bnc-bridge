const assert = require('assert')

const createController = require('./utils/proxyController')
const createUser = require('./utils/user')
const { waitPromise, delay } = require('./utils/wait')
const { getBalance } = require('./utils/bncController')

const testEthToBnc = require('./ethToBnc')
const testBncToEth = require('./bncToEth')

const usersConfig = require('../config').users
const validatorsConfig = require('../config').validators

const { FOREIGN_PRIVATE_KEY } = process.env

const controller1 = createController(1)
const controller2 = createController(2)
const controller3 = createController(3)

describe('bridge tests', function () {
  let users
  let foreignPrefundedUser
  let info
  let prevForeignBridgeBalance
  let prevForeignBridgeAddress

  before(async function () {
    users = await usersConfig.seqMap(user => createUser(user.privateKey))
  })

  describe('generation of initial epoch keys', function () {
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

  testEthToBnc(() => users, () => info.foreignBridgeAddress)
  testBncToEth(() => users, () => info.foreignBridgeAddress)

  describe('remove validator', function () {
    before(async function () {
      info = await controller1.getInfo()
      prevForeignBridgeBalance = info.foreignBalanceTokens
      prevForeignBridgeAddress = info.foreignBridgeAddress
    })

    it('should start voting process', async function () {
      await controller1.voteStartVoting()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'ready', 'Should not change state after one vote')

      await controller2.voteStartVoting()
      info = await waitPromise(controller1.getInfo, info => info.bridgeStatus === 'voting')
      assert.deepStrictEqual(info.epoch, 1, 'Current epoch is not set correctly')
      assert.deepStrictEqual(info.nextEpoch, 2, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.nextValidators, validatorsConfig, 'Next validators are not set correctly')

      await controller3.voteStartVoting()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not do anything after third vote')
      assert.deepStrictEqual(info.epoch, 1, 'Current epoch is not set correctly')
      assert.deepStrictEqual(info.nextEpoch, 2, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.nextValidators, validatorsConfig, 'Incorrect set of next validators after third vote')
    })

    it('should remove validator', async function () {
      await controller1.voteRemoveValidator(validatorsConfig[1])
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not change state after one vote')
      assert.deepStrictEqual(info.validators, validatorsConfig, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, validatorsConfig, 'Next validators are not set correctly')

      await controller2.voteRemoveValidator(validatorsConfig[1])
      info = await waitPromise(controller1.getInfo, info => info.nextValidators.length === 2)
      assert.deepStrictEqual(info.validators, validatorsConfig, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, [ validatorsConfig[0], validatorsConfig[2] ], 'Next validators are not set correctly')

      await controller3.voteRemoveValidator(validatorsConfig[1])
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not do anything after third vote')
      assert.deepStrictEqual(info.epoch, 1, 'Current epoch is not set correctly')
      assert.deepStrictEqual(info.nextEpoch, 2, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.validators, validatorsConfig, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, [ validatorsConfig[0], validatorsConfig[2] ], 'Incorrect set of next validators after third vote')
    })

    it('should start keygen process', async function () {
      await controller1.voteStartKeygen()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'voting', 'Should not change state after one vote')

      await controller2.voteStartKeygen()
      info = await waitPromise(controller1.getInfo, info => info.bridgeStatus === 'keygen')

      await controller3.voteStartKeygen()
      await delay(5000)
      info = await controller1.getInfo()
      assert.strictEqual(info.bridgeStatus, 'keygen', 'Should not do anything after third vote')
      assert.deepStrictEqual(info.epoch, 1, 'Current epoch is not set correctly')
      assert.deepStrictEqual(info.nextEpoch, 2, 'Next epoch is not set correctly')
      assert.deepStrictEqual(info.validators, validatorsConfig, 'Validators are not set correctly')
      assert.deepStrictEqual(info.nextValidators, [ validatorsConfig[0], validatorsConfig[2] ], 'Incorrect set of next validators after third vote')
    })

    it('should finish keygen process and start funds transfer', async function () {
      this.timeout(120000)
      info = await waitPromise(controller1.getInfo, info => info.bridgeStatus === 'funds_transfer')
    })

    it('should transfer all funds to new account and start new epoch', async function () {
      this.timeout(300000)
      info = await waitPromise(controller1.getInfo, info => info.epoch === 2)
      assert.deepStrictEqual(info.validators, [ validatorsConfig[0], validatorsConfig[2] ], 'Incorrect set of validators in epoch 2')
      assert.strictEqual(info.nextEpoch, 2, 'Incorrect next epoch')
      assert.strictEqual(info.bridgeStatus, 'ready', 'Incorrect bridge state in new epoch')
      await delay(5000)
      const prevBalance = await getBalance(prevForeignBridgeAddress)
      const newBalance = await getBalance(info.foreignBridgeAddress)
      assert.strictEqual(prevBalance, 0, "Did not transfer all funds")
      assert.strictEqual(newBalance, prevForeignBridgeBalance, "Funds are lost somewhere")
    })
  })

  testEthToBnc(() => users, () => info.foreignBridgeAddress)
  testBncToEth(() => users, () => info.foreignBridgeAddress)
})
