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

const {
  HOME_PRIVATE_KEY, FOREIGN_PRIVATE_KEY, HOME_BRIDGE_ADDRESS, FOREIGN_ASSET
} = process.env

const { controller1 } = require('./utils/proxyController')

describe('bridge tests', function () {
  let users

  before(async function () {
    users = await seqMap(usersConfig, (user) => createUser(user.privateKey))
  })

  describe('generation of initial epoch keys', function () {
    let info
    let ethPrefundedUser
    let bncPrefundedUser

    before(async function () {
      ethPrefundedUser = await createUser(HOME_PRIVATE_KEY)
      bncPrefundedUser = await createUser(FOREIGN_PRIVATE_KEY)

      const bnbBalance = await bncPrefundedUser.getBnbBalance()
      assert.ok(bnbBalance >= 0.5, `Insufficient BNB balance on ${bncPrefundedUser.ethAddress} in Binance network, expected 0.5 BNB, got ${bnbBalance}`)
      const bepBalance = await bncPrefundedUser.getBepBalance()
      assert.ok(bepBalance >= 500, `Insufficient BEP2 balance on ${bncPrefundedUser.ethAddress} in Binance network, expected 500 ${FOREIGN_ASSET}, got ${bepBalance}`)

      const ethBalance = await ethPrefundedUser.getEthBalance()
      assert.ok(ethBalance >= 0.5, `Insufficient ETH balance on ${ethPrefundedUser.ethAddress} in Ethereum network, expected 0.5 ETH, got ${ethBalance}`)
      const ercBalance = await ethPrefundedUser.getErcBalance()
      assert.ok(ercBalance >= 500, `Insufficient ERC20 balance on ${ethPrefundedUser.ethAddress} in Ethereum network, expected 500 ERC20, got ${ercBalance}`)


      for (let i = 0; i < 3; i += 1) {
        const userEthBalance = await users[i].getEthBalance()
        assert.ok(userEthBalance >= 0.2, `Insufficient ETH balance on ${users[i].ethAddress} in Ethereum network, expected 0.2 ETH, got ${userEthBalance}`)
        const userErcBalance = await users[i].getErcBalance()
        assert.ok(userErcBalance >= 50, `Insufficient ERC20 balance on ${users[i].ethAddress} in Ethereum network, expected 50 ERC20, got ${userErcBalance}`)
        const userBnbBalance = await users[i].getBepBalance()
        assert.ok(userBnbBalance >= 0.1, `Insufficient BNB balance on ${users[i].bncAddress} in Binance network, expected 0.1 BNB, got ${userBnbBalance}`)
        const userBepBalance = await users[i].getBepBalance()
        assert.ok(userErcBalance >= 50, `Insufficient BEP2 balance on ${users[i].bncAddress} in Binance network, expected 50 ${FOREIGN_ASSET}, got ${userBepBalance}`)
      }
    })

    it('should generate keys', async function () {
      this.timeout(120000)
      info = await waitPromise(controller1.getInfo, (newInfo) => newInfo.epoch === 1)
    })

    after(async function () {
      await bncPrefundedUser.transferBepBnb(info.foreignBridgeAddress, 100, 0.1)
      await ethPrefundedUser.transferErc(HOME_BRIDGE_ADDRESS, 100)
    })
  })

  testEthToBnc(() => users)
  testBncToEth(() => users)
  testEthToBnc(() => users)

  testRemoveValidator(validatorsConfig[1])

  testEthToBnc(() => users)
  testBncToEth(() => users)
  testEthToBnc(() => users)

  testAddValidator(validatorsConfig[1])

  testEthToBnc(() => users)
  testBncToEth(() => users)
  testEthToBncWithRestart(() => users, 99)

  testChangeThreshold(3)

  testEthToBnc(() => users)
  testBncToEth(() => users)
  testEthToBncWithRestart(() => users, 2)
  testEthToBnc(() => users)
})
