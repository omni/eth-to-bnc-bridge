const { waitPromise } = require('./utils/wait')

const { controller1 } = require('./utils/proxyController')

module.exports = (getUsers) => {
  describe('exchange of tokens in bnc => eth direction', function () {
    let users
    let info
    let ethBalances

    before(async function () {
      users = getUsers()
      info = await controller1.getInfo()
      ethBalances = await Promise.all(users.map((user) => user.getErcBalance()))

      await Promise.all(users.map((user, i) => user.exchangeBep(info.foreignBridgeAddress, 3 + i)))
    })

    it('should make correct exchange transactions on eth side', async function () {
      this.timeout(120000)
      for (let i = 0; i < 3; i += 1) {
        const user = users[i]
        await waitPromise(
          user.getErcBalance,
          // eslint-disable-next-line no-loop-func
          (newEthBalance) => newEthBalance === ethBalances[i] + 3 + i
        )
      }
    })
  })
}
