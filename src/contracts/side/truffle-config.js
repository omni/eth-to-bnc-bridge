module.exports = {
  networks: {
    test: {
      host: '127.0.0.1',
      port: 8545,
      network_id: 55
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
