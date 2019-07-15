const amqp = require('amqplib')
const Web3 = require('web3')
const redis = require('./db')
const crypto = require('crypto')
const utils = require('ethers').utils
const BN = require('bignumber.js')
const bech32 = require('bech32')

const abiBridge = require('./contracts_data/Bridge.json').abi
const abiToken = require('./contracts_data/IERC20.json').abi

const { HOME_RPC_URL, HOME_CHAIN_ID, HOME_BRIDGE_ADDRESS, RABBITMQ_URL, HOME_TOKEN_ADDRESS } = process.env

const web3Home = new Web3(HOME_RPC_URL)
const bridge = new web3Home.eth.Contract(abiBridge, HOME_BRIDGE_ADDRESS)
const token = new web3Home.eth.Contract(abiToken, HOME_TOKEN_ADDRESS)

let channel
let signQueue
let keygenQueue
let cancelKeygenQueue
let blockNumber
let foreignNonce = []
let epoch
let redisTx

async function connectRabbit (url) {
  return amqp.connect(url).catch(() => {
    console.log('Failed to connect, reconnecting')
    return new Promise(resolve =>
      setTimeout(() => resolve(connectRabbit(url)), 1000)
    )
  })
}

async function initialize () {
  const connection = await connectRabbit(RABBITMQ_URL)
  channel = await connection.createChannel()
  signQueue = await channel.assertQueue('signQueue')
  keygenQueue = await channel.assertQueue('keygenQueue')
  cancelKeygenQueue = await channel.assertQueue('cancelKeygenQueue')

  const events = await bridge.getPastEvents('EpochStart', {
    fromBlock: 1
  })
  epoch = events.length ? events[events.length - 1].returnValues.epoch.toNumber() : 0
  console.log(`Current epoch ${epoch}`)
  const epochStart = events.length ? events[events.length - 1].blockNumber : 1
  const saved = (parseInt(await redis.get('homeBlock')) + 1) || 1
  console.log(epochStart, saved)
  if (epochStart > saved) {
    console.log(`Data in db is outdated, starting from epoch ${epoch}, block #${epochStart}`)
    blockNumber = epochStart
    await redis.multi()
      .set('homeBlock', blockNumber - 1)
      .set(`foreignNonce${epoch}`, 0)
      .exec()
    foreignNonce[epoch] = 0
  } else {
    console.log('Restoring epoch and block number from local db')
    blockNumber = saved
    foreignNonce[epoch] = parseInt(await redis.get(`foreignNonce${epoch}`)) || 0
  }
}

async function main () {
  console.log(`Watching events in block #${blockNumber}`)
  if (await web3Home.eth.getBlock(blockNumber) === null) {
    console.log('No block')
    await new Promise(r => setTimeout(r, 1000))
    return
  }

  redisTx = redis.multi()

  const bridgeEvents = await bridge.getPastEvents('allEvents', {
    fromBlock: blockNumber,
    toBlock: blockNumber
  })

  for (const event of bridgeEvents) {
    switch (event.event) {
      case 'NewEpoch':
        await sendKeygen(event)
        break
      case 'NewEpochCancelled':
        sendKeygenCancelation(event)
        break
      case 'NewFundsTransfer':
        await sendSignFundsTransfer(event)
        break
      case 'EpochStart':
        epoch = event.returnValues.epoch.toNumber()
        console.log(`Epoch ${epoch} started`)
        foreignNonce[epoch] = 0
        break
    }
  }

  const transferEvents = await token.getPastEvents('Transfer', {
    filter: {
      to: HOME_BRIDGE_ADDRESS
    },
    fromBlock: blockNumber,
    toBlock: blockNumber
  })

  for (const event of transferEvents) {
    await sendSign(event)
  }

  blockNumber++
  // Exec redis tx
  await redisTx.incr('homeBlock').exec()
}

initialize().then(async () => {
  while (true) {
    await main()
  }
})

async function sendKeygen (event) {
  const newEpoch = event.returnValues.newEpoch.toNumber()
  channel.sendToQueue(keygenQueue.queue, Buffer.from(JSON.stringify({
    epoch: newEpoch,
    threshold: (await bridge.methods.getThreshold(newEpoch).call()).toNumber(),
    parties: (await bridge.methods.getParties(newEpoch).call()).toNumber()
  })), {
    persistent: true
  })
  console.log('Sent keygen start event')
}

function sendKeygenCancelation (event) {
  const epoch = event.returnValues.epoch.toNumber()
  channel.sendToQueue(cancelKeygenQueue.queue, Buffer.from(JSON.stringify({
    epoch
  })), {
    persistent: true
  })
  console.log('Sent keygen cancellation event')
}

async function sendSignFundsTransfer (event) {
  const newEpoch = event.returnValues.newEpoch.toNumber()
  const oldEpoch = event.returnValues.oldEpoch.toNumber()
  channel.sendToQueue(signQueue.queue, Buffer.from(JSON.stringify({
    epoch: oldEpoch,
    newEpoch,
    nonce: foreignNonce[oldEpoch],
    threshold: (await bridge.methods.getThreshold(oldEpoch).call()).toNumber(),
    parties: (await bridge.methods.getParties(oldEpoch).call()).toNumber()
  })), {
    persistent: true
  })
  console.log('Sent sign funds transfer event')
  foreignNonce[oldEpoch]++
  redisTx.incr(`foreignNonce${oldEpoch}`)
}

async function sendSign (event) {
  const tx = await web3Home.eth.getTransaction(event.transactionHash)
  const msg = utils.serializeTransaction({
    nonce: tx.nonce,
    gasPrice: `0x${new BN(tx.gasPrice).toString(16)}`,
    gasLimit: `0x${new BN(tx.gas).toString(16)}`,
    to: tx.to,
    value: `0x${new BN(tx.value).toString(16)}`,
    data: tx.input,
    chainId: parseInt(HOME_CHAIN_ID)
  })
  const hash = web3Home.utils.sha3(msg)
  const publicKey = utils.recoverPublicKey(hash, { r: tx.r, s: tx.s, v: tx.v })
  channel.sendToQueue(signQueue.queue, Buffer.from(JSON.stringify({
    recipient: publicKeyToAddress({
      x: publicKey.substr(4, 64),
      y: publicKey.substr(68, 64)
    }),
    value: event.returnValues.value.toNumber(),
    epoch,
    nonce: foreignNonce[epoch],
    threshold: (await bridge.methods.getThreshold(epoch).call()).toNumber(),
    parties: (await bridge.methods.getParties(epoch).call()).toNumber()
  })), {
    persistent: true
  })
  console.log('Sent new sign event')

  redisTx.incr(`foreignNonce${epoch}`)
  foreignNonce[epoch]++
}

function publicKeyToAddress ({ x, y }) {
  const compact = (parseInt(y[y.length - 1], 16) % 2 ? '03' : '02') + padZeros(x, 64)
  const sha256Hash = crypto.createHash('sha256').update(Buffer.from(compact, 'hex')).digest('hex')
  const hash = crypto.createHash('ripemd160').update(Buffer.from(sha256Hash, 'hex')).digest('hex')
  const words = bech32.toWords(Buffer.from(hash, 'hex'))
  return bech32.encode('tbnb', words)
}

function padZeros (s, len) {
  while (s.length < len)
    s = '0' + s
  return s
}
