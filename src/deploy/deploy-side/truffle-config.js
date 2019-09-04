const PrivateKeyProvider = require('truffle-hdwallet-provider')

const { SIDE_RPC_URL, SIDE_PRIVATE_KEY } = process.env

module.exports = {
  networks: {
    side: {
      provider: new PrivateKeyProvider(SIDE_PRIVATE_KEY, SIDE_RPC_URL),
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
