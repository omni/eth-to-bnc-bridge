const TokenContract = artifacts.require('ERC20Mintable')

module.exports = async (deployer, network, accounts) => {
  await deployer.deploy(TokenContract)

  const instance = await TokenContract.deployed()
  await instance.mint(accounts[0], 1000000)
}
