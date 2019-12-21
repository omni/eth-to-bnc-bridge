const SharedDB = artifacts.require('SharedDB')

module.exports = (deployer) => {
  deployer.deploy(SharedDB)
}
