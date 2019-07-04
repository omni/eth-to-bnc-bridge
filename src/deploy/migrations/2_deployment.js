require('dotenv').config()

const SharedDB = artifacts.require('SharedDB')

const {
  THRESHOLD, PARTIES, VALIDATOR_ADDRESS_1, VALIDATOR_ADDRESS_2, VALIDATOR_ADDRESS_3, VALIDATOR_ADDRESS_4,
  VALIDATOR_ADDRESS_5, VALIDATOR_ADDRESS_6, TOKEN_ADDRESS
} = process.env

module.exports = deployer => {
  deployer.deploy(
    SharedDB,
    THRESHOLD,
    PARTIES,
    [
      VALIDATOR_ADDRESS_1,
      VALIDATOR_ADDRESS_2,
      VALIDATOR_ADDRESS_3,
      //VALIDATOR_ADDRESS_4,
      //VALIDATOR_ADDRESS_5,
      //VALIDATOR_ADDRESS_6
    ],
    TOKEN_ADDRESS
  )
}
