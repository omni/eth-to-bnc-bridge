const Bridge = artifacts.require('Bridge')

const addresses = Object.entries(process.env)
  .filter(([ key ]) => key.startsWith('VALIDATOR_ADDRESS'))
  .map(([ , value ]) => value)

const {
  THRESHOLD, TOKEN_ADDRESS, TOKEN_ADDRESS_DEV
} = process.env

module.exports = (deployer, network) => {
  deployer.deploy(
    Bridge,
    THRESHOLD,
    addresses,
    network === 'development' ? TOKEN_ADDRESS_DEV : TOKEN_ADDRESS
  )
}
