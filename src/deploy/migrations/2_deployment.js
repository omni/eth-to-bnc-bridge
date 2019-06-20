require('dotenv').config()

const Migrations = artifacts.require('SharedDB')

const { THRESHOLD, PARTIES } = process.env

module.exports = deployer => {
  deployer.deploy(Migrations, THRESHOLD, PARTIES)
}
