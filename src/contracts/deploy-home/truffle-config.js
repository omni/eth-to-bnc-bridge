const PrivateKeyProvider = require('truffle-hdwallet-provider')

const { HOME_RPC_URL, HOME_PRIVATE_KEY } = process.env

module.exports = {
  networks: {
    home: {
      provider: new PrivateKeyProvider(HOME_PRIVATE_KEY, HOME_RPC_URL),
      network_id: '*'
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
