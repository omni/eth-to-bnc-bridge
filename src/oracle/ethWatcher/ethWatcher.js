const amqp = require('amqplib')
const Web3 = require('web3')
const redis = require('./db')
const bridgeAbi = require('./contracts_data/Bridge.json').abi

const { HOME_RPC_URL, HOME_BRIDGE_ADDRESS, RABBITMQ_URL } = process.env

const web3Home = new Web3(HOME_RPC_URL)
const homeBridge = new web3Home.eth.Contract(bridgeAbi, HOME_BRIDGE_ADDRESS)

let channel
let signQueue
let epochQueue
let blockNumber
let foreignNonce = []
let epoch

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
  epochQueue = await channel.assertQueue('epochQueue')

  const events = await homeBridge.getPastEvents('KeygenCompleted', {
    fromBlock: 1
  })
  epoch = events.length ? events[events.length - 1].returnValues.epoch.toNumber() : 0
  console.log(`Current epoch ${epoch}`)
  const dbEpoch = parseInt(await redis.get('epoch')) // number, or NaN if empty
  if (epoch !== dbEpoch) {
    console.log('Current epoch is outdated, starting from new epoch and block number')
    blockNumber = events.length ? events[events.length - 1].blockNumber : 1
    await redis.multi()
      .set('epoch', epoch)
      .set('homeBlock', blockNumber - 1)
      .set(`foreignNonce${epoch}`, 0)
      .exec()
    foreignNonce[epoch] = 0
  } else {
    console.log('Restoring epoch and block number from local db')
    blockNumber = (parseInt(await redis.get('homeBlock')) + 1) || 1
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

  const events = await homeBridge.getPastEvents('allEvents', {
    fromBlock: blockNumber,
    toBlock: blockNumber
  })
  const epochEvents = events.filter(x => x.event === 'NewEpoch')
  const transferEvents = events.filter(x => x.event === 'ReceivedTokens')

  epochEvents.forEach(event => {
      const newEpoch = event.returnValues.epoch.toNumber()
      const oldEpoch = newEpoch - 1
      channel.sendToQueue(epochQueue.queue, Buffer.from(JSON.stringify({
        epoch: newEpoch
      })), {
        persistent: true
      })
      console.log('Sent new epoch event')

      if (oldEpoch > 0) {
        // Transfer all assets to new account tss account
        channel.sendToQueue(signQueue.queue, Buffer.from(JSON.stringify({
          epoch: newEpoch,
          //nonce: foreignNonce[oldEpoch],
        })), {
          persistent: true
        })
        console.log('Sent new epoch sign event')

        foreignNonce[oldEpoch]++
        redis.incr(`foreignNonce${oldEpoch}`)
      }

      redis.multi()
        .incr('epoch')
        .set(`foreignNonce${newEpoch}`, 0)
        .exec()
      foreignNonce[newEpoch] = 0
      epoch++
    }
  )

  transferEvents.forEach(event => {
      channel.sendToQueue(signQueue.queue, Buffer.from(JSON.stringify({
        recipient: event.returnValues.recipient,
        value: event.returnValues.value.toNumber(),
        epoch,
        nonce: foreignNonce[epoch]
      })), {
        persistent: true
      })
      console.log('Sent new sign event')

      redis.incr(`foreignNonce${epoch}`)
      foreignNonce[epoch]++
    }
  )
  await redis.incr('homeBlock')
  blockNumber++
}

initialize().then(async () => {
  while (true) {
    await main()
  }
})
