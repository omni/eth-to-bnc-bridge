const Web3 = require('web3')

const web3 = new Web3('https://sokol.poa.network')

async function main () {
  console.log(await web3.eth.getBalance('0x48138BEC745673Fe2CE28C62c9944Ab0Fa56b495'))
}

main()
