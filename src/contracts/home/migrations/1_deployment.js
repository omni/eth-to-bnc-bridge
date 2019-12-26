const Bridge = artifacts.require('EthToBncBridge')
const TokenContract = artifacts.require('Token')

const addresses = Object.entries(process.env)
  .filter(([key]) => key.startsWith('VALIDATOR_ADDRESS'))
  .map(([, value]) => value)

const {
  THRESHOLD, HOME_TOKEN_ADDRESS, MIN_TX_LIMIT, MAX_TX_LIMIT, BLOCKS_RANGE_SIZE, CLOSE_EPOCH_FLAG,
  DEPLOY_TOKEN, TOKEN_INITIAL_MINT
} = process.env

module.exports = DEPLOY_TOKEN
  ? async (deployer, network, accounts) => {
    if (network === 'test' || network === 'coverage') {
      return
    }
    await deployer.deploy(TokenContract)

    const instance = await TokenContract.deployed()
    await instance.mint(accounts[0], TOKEN_INITIAL_MINT)
  }
  : (deployer, network) => {
    if (network === 'test' || network === 'coverage') {
      return
    }
    deployer.deploy(
      Bridge,
      THRESHOLD,
      addresses,
      HOME_TOKEN_ADDRESS,
      [MIN_TX_LIMIT, MAX_TX_LIMIT],
      BLOCKS_RANGE_SIZE,
      CLOSE_EPOCH_FLAG === 'true'
    )
  }
