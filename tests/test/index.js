const createController = require('./utils/proxyController')
const createUser = require('./utils/user')
const { waitPromise } = require('./utils/wait')

const testEthToBnc = require('./ethToBnc')

const { FOREIGN_PRIVATE_KEY } = process.env

let user

let { getInfo } = createController(1)

let info

describe('generates initial epoch keys', function () {
  before(async function () {
    this.timeout(60000)
    user = await createUser(FOREIGN_PRIVATE_KEY)
  })

  it('should generate keys in 2 min', async function () {
    this.timeout(120000)
    info = await waitPromise(getInfo, info => info.epoch === 1)
  })

  after(async function () {
    this.timeout(60000)
    await user.transferBnc(info.foreignBridgeAddress, 50, 0.1)
  })
})

testEthToBnc(() => info.foreignBridgeAddress)
