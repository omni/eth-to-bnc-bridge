const Bridge = artifacts.require('Bridge')

const addresses = Object.entries(process.env)
  .filter(([ key ]) => key.startsWith('VALIDATOR_ADDRESS'))
  .map(([ , value ]) => value)

const {
  THRESHOLD, HOME_TOKEN_ADDRESS
} = process.env

module.exports = deployer => {
  deployer.deploy(
    Bridge,
    THRESHOLD,
    addresses,
    HOME_TOKEN_ADDRESS
  )
}