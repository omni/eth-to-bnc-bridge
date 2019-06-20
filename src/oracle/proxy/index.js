const express = require('express')
const Web3 = require('web3')

const { RPC_URL, SHARED_DB_ADDRESS, VALIDATOR_PRIVATE_KEY } = process.env
const abi = require('./contracts_data/SharedDB.json').abi

const web3 = new Web3(RPC_URL, null, { transactionConfirmationBlocks: 1 })
const contract = new web3.eth.Contract(abi, SHARED_DB_ADDRESS)
const validatorAddress = web3.eth.accounts.privateKeyToAccount(`0x${VALIDATOR_PRIVATE_KEY}`).address

let validatorNonce

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.post('/get', get)

app.post('/set', set)
app.post('/signupkeygen', signupKeygen)
app.post('/signupsign', signupSign)

async function main () {
  validatorNonce = await web3.eth.getTransactionCount(validatorAddress)

  app.listen(8001, () => {
    console.log('Listening on port 8001')
  })
}

function Ok (data) {
  return { Ok: data }
}

function hash (key) {
  return web3.utils.sha3(JSON.stringify(key))
}

async function get (req, res) {
  console.log('Get call')
  while (true) {
    const result = await contract.methods.db(hash(req.body.key)).call()
    if (result !== '') {
      res.send(Ok({ key: req.body.key, value: result }))
      break
    }
  }
  console.log('Get end')
}

async function set (req, res) {
  console.log('Set call')
  const query = contract.methods.set(hash(req.body.key), req.body.value)
  await sendQuery(query)

  res.send(Ok(null))
  console.log('Set end')
}

async function signupKeygen (req, res) {
  console.log('SignupKeygen call')
  const query = contract.methods.signupKeygen()
  const receipt = await sendQuery(query)

  while (true) {
    const events = await contract.getPastEvents('SignupKeygen', {
      filter: { from: validatorAddress },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber
    })
    const event = events[0]

    if (event) {
      res.send(Ok({ uuid: event.returnValues.uuid.toString(), number: event.returnValues.number }))
      break
    }
  }
  console.log('SignupKeygen end')
}

async function signupSign (req, res) {
  console.log('SignupSign call')
  const query = contract.methods.signupSign()
  const receipt = await sendQuery(query)

  while (true) {
    const events = await contract.getPastEvents('SignupSign', {
      filter: { from: validatorAddress },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber
    })
    const event = events[0]

    if (event) {
      res.send(Ok({ uuid: event.returnValues.uuid.toString(), number: event.returnValues.number }))
      break
    }
  }
  console.log('SignupSign call')
}

async function sendQuery (query) {
  const encodedABI = query.encodeABI()
  const tx = {
    data: encodedABI,
    from: validatorAddress,
    to: SHARED_DB_ADDRESS,
    nonce: validatorNonce++,
    chainId: 33
  }
  tx.gas = await query.estimateGas(tx)
  const signedTx = await web3.eth.accounts.signTransaction(tx, VALIDATOR_PRIVATE_KEY)

  const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)

  return receipt
}

main()
