const { expect } = require('chai')

const {
  Status, Action, getDeployResult, expectEventInLogs, buildMessage, sign, stripHex
} = require('./utils')

const EthToBncBridge = artifacts.require('EthToBncBridge')
const Token = artifacts.require('Token')

const TOKEN_INITIAL_MINT = '31415000000000000000000000'
const MIN_TX_LIMIT = '10000000000'
const MAX_TX_LIMIT = '1000000000000'

contract('EthToBncBridge', async (accounts) => {
  let token

  before(async () => {
    token = await Token.new({ from: accounts[0] })
    await token.mint(accounts[1], TOKEN_INITIAL_MINT, { from: accounts[0] })
  })

  describe('constructor', async () => {
    it('should initialize bridge', async () => {
      const validators = [accounts[2], accounts[3], accounts[4]]
      const bridge = await EthToBncBridge.new(
        2,
        validators,
        token.address,
        [MIN_TX_LIMIT, MAX_TX_LIMIT],
        15,
        true
      ).should.be.fulfilled
      expect(await bridge.epoch()).to.bignumber.equal('0')
      expect(await bridge.nextEpoch()).to.bignumber.equal('1')
      expect(await bridge.getNextValidators()).to.deep.equal(validators)
      expect(await bridge.getNextThreshold()).to.bignumber.equal('2')
      expect(await bridge.getNextMinPerTx()).to.bignumber.equal(MIN_TX_LIMIT)
      expect(await bridge.getNextMaxPerTx()).to.bignumber.equal(MAX_TX_LIMIT)
      expect(await bridge.getNextRangeSize()).to.bignumber.equal('15')
      expect(await bridge.getNextCloseEpoch()).to.equal(true)
      expect(await bridge.status()).to.bignumber.equal(Status.KEYGEN)
      expect(await bridge.tokenContract()).to.equal(token.address)

      const { logs } = await getDeployResult(bridge)

      expectEventInLogs(logs, 'NewEpoch', {
        oldEpoch: '0',
        newEpoch: '1'
      })
    })

    it('should accept only valid threshold', async () => {
      const validators = [accounts[2], accounts[3], accounts[4]]
      await EthToBncBridge.new(
        3,
        validators,
        token.address,
        [MIN_TX_LIMIT, MAX_TX_LIMIT],
        15,
        true
      ).should.be.fulfilled
      await EthToBncBridge.new(
        4,
        validators,
        token.address,
        [MIN_TX_LIMIT, MAX_TX_LIMIT],
        15,
        true
      ).should.be.rejected
    })

    it('should accept only valid limits', async () => {
      const validators = [accounts[2], accounts[3], accounts[4]]
      await EthToBncBridge.new(
        2,
        validators,
        token.address,
        ['100', MAX_TX_LIMIT],
        15,
        true
      ).should.be.rejected
      await EthToBncBridge.new(
        2,
        validators,
        token.address,
        [MIN_TX_LIMIT, '100'],
        15,
        true
      ).should.be.rejected
      await EthToBncBridge.new(
        2,
        validators,
        token.address,
        ['100', '100'],
        15,
        true
      ).should.be.rejected
      await EthToBncBridge.new(
        2,
        validators,
        token.address,
        [MIN_TX_LIMIT, MIN_TX_LIMIT],
        15,
        true
      ).should.be.fulfilled
    })
  })

  describe('signatures checks', async () => {
    const validators = [accounts[2], accounts[3], accounts[4]]
    const keygenMessage = buildMessage(
      Action.CONFIRM_KEYGEN,
      1,
      '1111111111111111111111111111111111111111111111111111111111111111',
      '2222222222222222222222222222222222222222222222222222222222222222'
    )
    const votingMessage = buildMessage(Action.VOTE_START_VOTING, 1)
    const validatorMessage = buildMessage(Action.VOTE_ADD_VALIDATOR, 1, stripHex(accounts[0]), '000000000000000000')
    const messages = [keygenMessage, votingMessage, validatorMessage]
    const invalidMessage = `${votingMessage}00`
    let bridge

    before(async () => {
      bridge = await EthToBncBridge.new(
        2,
        validators,
        token.address,
        [MIN_TX_LIMIT, MAX_TX_LIMIT],
        15,
        true
      )
    })

    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i]
      it(`should accept 2 or 3 correct signatures for message of length ${(message.length - 2) / 2} bytes`, async () => {
        const signature1 = stripHex(await sign(validators[0], message))
        const signature2 = stripHex(await sign(validators[1], message))
        const signature3 = stripHex(await sign(validators[2], message))

        await bridge.checkSignedMessage(message, `0x${signature1}${signature2}`).should.be.fulfilled
        await bridge.checkSignedMessage(message, `0x${signature2}${signature1}`).should.be.fulfilled
        await bridge.checkSignedMessage(message, `0x${signature1}${signature2}${signature3}`).should.be.fulfilled
        await bridge.checkSignedMessage(message, `0x${signature3}${signature1}${signature2}`).should.be.fulfilled
      })
    }

    it(`should not accept correct signatures for message of length ${(invalidMessage.length / 2) / 2}`, async () => {
      const signature1 = stripHex(await sign(validators[0], invalidMessage))
      const signature2 = stripHex(await sign(validators[1], invalidMessage))

      await bridge.checkSignedMessage(invalidMessage, `0x${signature1}${signature2}`).should.be.rejected
    })

    it('should not accept empty signatures', async () => {
      await bridge.checkSignedMessage(keygenMessage, '0x').should.be.rejected
    })

    it('should not accept 1 correct signature', async () => {
      const signature1 = stripHex(await sign(validators[0], keygenMessage))

      await bridge.checkSignedMessage(keygenMessage, `0x${signature1}`).should.be.rejected
    })

    it('should not accept repeated correct signatures', async () => {
      const signature1 = stripHex(await sign(validators[0], keygenMessage))
      const signature2 = stripHex(await sign(validators[1], keygenMessage))

      await bridge.checkSignedMessage(keygenMessage, `0x${signature1}${signature1}`).should.be.rejected
      await bridge.checkSignedMessage(keygenMessage, `0x${signature1}${signature2}${signature1}`).should.be.rejected
    })

    it('should accept signatures only from validators', async () => {
      const signature1 = stripHex(await sign(validators[0], keygenMessage))
      const signature2 = stripHex(await sign(validators[1], keygenMessage))
      const wrongSignature = stripHex(await sign(accounts[5], keygenMessage))

      await bridge.checkSignedMessage(keygenMessage, `0x${signature1}${wrongSignature}`).should.be.rejected
      await bridge.checkSignedMessage(keygenMessage, `0x${signature1}${signature2}${wrongSignature}`).should.be.rejected
    })
  })

  describe('keygen completion', async () => {
    const validators = [accounts[2], accounts[3], accounts[4]]
    const message = buildMessage(
      Action.CONFIRM_KEYGEN,
      1,
      '1111111111111111111111111111111111111111111111111111111111111111',
      '2222222222222222222222222222222222222222222222222222222222222222'
    )
    let bridge

    beforeEach(async () => {
      bridge = await EthToBncBridge.new(
        2,
        validators,
        token.address,
        [MIN_TX_LIMIT, MAX_TX_LIMIT],
        15,
        true
      )
    })

    it('should complete keygen', async () => {
      const signature1 = stripHex(await sign(validators[0], message))
      const signature2 = stripHex(await sign(validators[1], message))
      const { logs } = await bridge.applyMessage(message, `0x${signature1}${signature2}`).should.be.fulfilled
      expectEventInLogs(logs, 'EpochStart', {
        x: '0x1111111111111111111111111111111111111111111111111111111111111111',
        y: '0x2222222222222222222222222222222222222222222222222222222222222222'
      })

      expect(await bridge.epoch()).to.bignumber.equal('1')
      expect(await bridge.nextEpoch()).to.bignumber.equal('1')
      expect(await bridge.getValidators()).to.deep.equal(validators)
      expect(await bridge.getThreshold()).to.bignumber.equal('2')
      expect(await bridge.getMinPerTx()).to.bignumber.equal(MIN_TX_LIMIT)
      expect(await bridge.getMaxPerTx()).to.bignumber.equal(MAX_TX_LIMIT)
      expect(await bridge.getRangeSize()).to.bignumber.equal('15')
      expect(await bridge.getCloseEpoch()).to.equal(true)
      expect(await bridge.status()).to.bignumber.equal(Status.READY)
    })

    it('should not accept already applied message', async () => {
      const signature1 = stripHex(await sign(validators[0], message))
      const signature2 = stripHex(await sign(validators[1], message))

      await bridge.applyMessage(message, `0x${signature1}${signature2}`)
      await bridge.checkSignedMessage(message, `0x${signature1}${signature2}`).should.be.rejected
    })

    it('should not be able to apply keygen confirm message for 2nd epoch', async () => {
      const signature1 = stripHex(await sign(validators[0], message))
      const signature2 = stripHex(await sign(validators[1], message))

      await bridge.applyMessage(message, `0x${signature1}${signature2}`)

      const newMessage = buildMessage(
        Action.CONFIRM_KEYGEN,
        2,
        '3333333333333333333333333333333333333333333333333333333333333333',
        '4444444444444444444444444444444444444444444444444444444444444444'
      )
      await bridge.applyMessage(newMessage, `0x${signature1}${signature2}`).should.be.rejected
    })
  })
})
