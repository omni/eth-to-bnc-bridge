const { delay } = require('./utils/wait')

const { controller1 } = require('./utils/proxyController')

module.exports = (usersFunc) => {
  describe('exchange of tokens in bnc => eth direction', function () {
    let users
    let info
    let ethBalances

    before(async function () {
      users = usersFunc()
      info = await controller1.getInfo()
      ethBalances = await Promise.all(users.map((user) => user.getEthBalance()))

      await Promise.all(users.map((user, i) => user.exchangeBnc(info.foreignBridgeAddress, 3 + i)))
    })

    it('should make correct exchange transactions on eth side', async function () {
      for (let i = 0; i < 3; i += 1) {
        while (true) {
          const user = users[i]
          const newEthBalance = await user.getEthBalance()
          if (newEthBalance === ethBalances[i] + 3 + i) {
            break
          }
          await delay(500)
        }
      }
    })
  })
}
