const express = require('express')
const Web3 = require('web3')
const fs = require('fs')
const BN = require('bignumber.js')
const ethers = require('ethers')

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

app.get('/params', params)
app.post('/confirm', confirm)

async function main () {
  validatorNonce = await web3.eth.getTransactionCount(validatorAddress)

  try {
    fs.mkdirSync('/generated_data')
  } catch (e) {

  }

  app.listen(8001, () => {
    console.log('Listening on port 8001')
  })
}

function Ok (data) {
  return { Ok: data }
}

function Err (data) {
  return { Err: data }
}

async function get (req, res) {
  console.log('Get call')
  const uuid = req.body.key.third
  const from = parseInt(req.body.key.first)
  const to = Number(req.body.key.fourth)
  const key = web3.utils.sha3(`${req.body.key.second}_${to}`)

  const data = await (uuid.startsWith('k')
    ? contract.methods.getKeygenData(from, key).call()
    : contract.methods.getSignData(from, uuid, key).call())

  const result = web3.utils.hexToUtf8(data)
  if (result.length)
    res.send(Ok({ key: req.body.key, value: result }))
  else {
    setTimeout(() => res.send(Err(null)), 1000)
  }

  console.log('Get end')
}

async function set (req, res) {
  console.log('Set call')
  const uuid = req.body.key.third
  const to = Number(req.body.key.fourth)
  const key = web3.utils.sha3(`${req.body.key.second}_${to}`)

  const query = uuid.startsWith('k') ? contract.methods.setKeygenData(key, web3.utils.utf8ToHex(req.body.value))
    : contract.methods.setSignData(uuid, key, web3.utils.utf8ToHex(req.body.value))
  await sendQuery(query)
  fs.writeFileSync(`/generated_data/${req.body.key.first}_${req.body.key.second}_${req.body.key.third}_${req.body.key.fourth}.json`, req.body.value)

  res.send(Ok(null))
  console.log('Set end')
}

async function signupKeygen (req, res) {
  console.log('SignupKeygen call')
  const epoch = (await contract.methods.epoch().call()).toNumber()
  const partyId = (await contract.methods.getPartyId().call({ from: validatorAddress })).toNumber()

  res.send(Ok({ uuid: `k${epoch}`, number: partyId }))
  console.log('SignupKeygen end')
}

async function signupSign (req, res) {
  console.log('SignupSign call')
  console.log(req.body.third)
  const hash = web3.utils.sha3(`0x${req.body.third}`)
  const query = contract.methods.signupSign(hash)
  const receipt = await sendQuery(query)

  while (true) {
    const events = await contract.getPastEvents('Signup', {
      filter: { from: validatorAddress, hash },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber
    })
    const event = events[0]

    if (event) {
      res.send(Ok({ uuid: hash, number: event.returnValues.partyId.toNumber() }))
      break
    }
  }
  console.log('SignupSign end')
}

async function confirm (req, res) {
  console.log('Confirm call')
  const { x, y } = req.body[5]
  const query = contract.methods.confirm(`0x${x}`, `0x${y}`)
  await sendQuery(query)
  //const addr = `0x${web3.utils.sha3(`0x${x}${y}`).substring(26)}`
  //console.log(addr)
  res.send()
  console.log('Confirm end')
}

async function params (req, res) {
  console.log('Params call')
  const epoch = parseInt(req.query.epoch)
  const parties = (await contract.methods.parties(epoch).call()).toNumber().toString()
  const threshold = (await contract.methods.threshold(epoch).call()).toNumber().toString()
  res.send({ parties, threshold })
  console.log('Params end')
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
  tx.gas = Math.min(Math.ceil(await query.estimateGas(tx) * 1.5), 6721975)
  const signedTx = await web3.eth.accounts.signTransaction(tx, VALIDATOR_PRIVATE_KEY)

  const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)

  return receipt
}

main()
