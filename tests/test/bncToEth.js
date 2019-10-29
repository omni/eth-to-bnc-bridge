const { delay } = require('./utils/wait')

module.exports = (usersFunc, foreignBridgeAddressFunc) => {
  describe('exchange of tokens in bnc => eth direction', function () {
    let users
    let foreignBridgeAddress
    let ethBalances

    before(async function () {
      users = usersFunc()
      foreignBridgeAddress = foreignBridgeAddressFunc()
      ethBalances = await Promise.all(users.map(user => user.getEthBalance()))

      await Promise.all(users.map((user, i) => user.exchangeBnc(foreignBridgeAddress, 3 + i)))
    })

    it('should make coorect exchange transactions on eth side', async function () {
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
