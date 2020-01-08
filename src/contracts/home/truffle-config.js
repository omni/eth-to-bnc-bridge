module.exports = {
  networks: {
    test: {
      host: '127.0.0.1',
      port: 8545,
      network_id: 55
    },
    coverage: {
      host: '127.0.0.1',
      port: 8545,
      network_id: 55,
      gas: 0xfffffffffff,
      gasPrice: 0x01
    }
  },
  compilers: {
    solc: {
      version: '0.5.9',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
}
