const TokenContract = artifacts.require('Token')

const {
  TOKEN_INITIAL_MINT
} = process.env

module.exports = async (deployer, network, accounts) => {
  await deployer.deploy(TokenContract)

  const instance = await TokenContract.deployed()
  await instance.mint(accounts[0], TOKEN_INITIAL_MINT)
}
