require('dotenv').config()

const PrivateKeyProvider = require('truffle-hdwallet-provider')

const { RPC_URL, PRIVATE_KEY, RPC_URL_DEV, PRIVATE_KEY_DEV } = process.env

module.exports = {
  networks: {
    development: {
      provider: new PrivateKeyProvider(PRIVATE_KEY_DEV, RPC_URL_DEV),
      network_id: '44'
    },
    staging: {
      provider: new PrivateKeyProvider(PRIVATE_KEY, RPC_URL),
      network_id: '77'
    }
  },
  compilers: {
    solc: {
      version: '0.5.9',
      settings: {
        optimizer: {
          enabled: true,
          runs: 3
        }
      }
    }
  }
}
