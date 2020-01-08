const SharedDB = artifacts.require('SharedDB')

module.exports = (deployer, network) => {
  if (network === 'test' || network === 'coverage') {
    return
  }
  deployer.deploy(SharedDB)
}
