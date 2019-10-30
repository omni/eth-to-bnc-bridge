const { delay } = require('./utils/wait')

const { controller1 } = require('./utils/proxyController')

module.exports = usersFunc => {
  describe('exchange of tokens in bnc => eth direction', function () {
    let users
    let info
    let ethBalances

    before(async function () {
      users = usersFunc()
      info = await controller1.getInfo()
      ethBalances = await Promise.all(users.map(user => user.getEthBalance()))

      await Promise.all(users.map((user, i) => user.exchangeBnc(info.foreignBridgeAddress, 3 + i)))
    })

    it('should make coorect exchange transactions on eth side', async function () {
      this.timeout(180000)
      for (let i = 0; i < 3; i++) {
        do {
          const user = users[i]
          const newEthBalance = await user.getEthBalance()
          if (newEthBalance === ethBalances[i] + 3 + i) {
            break
          }
          await delay(500)
        } while (true)
      }
    })
  })
}
