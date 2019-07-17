module.exports = {
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
