const { BN } = web3.utils

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bn')(BN))

require('chai/register-should')

module.exports = { BN }
