import Web3 from 'web3'
import { eth } from 'config'
import {get, set} from 'db'

const {rpcUrl, pollingInterval} = eth

const web3 = new Web3(rpcUrl)

async function main () {
  const lastProcessedBlock = await get('lastProcessedBlock')

  try {
    const block = await web3.eth.getBlock(lastProcessedBlock + 1)
    block.transactions.forEach(transaction => {

    })
  } catch (e) {

  }
}

setInterval(main, pollingInterval)
