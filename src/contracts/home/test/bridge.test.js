const { expect } = require('chai')

const {
  State, Action, getDeployResult, expectEventInLogs, buildMessage, sign, stripHex, skipBlocks,
  keccak256
} = require('./utils')

const EthToBncBridge = artifacts.require('EthToBncBridge')
const Token = artifacts.require('Token')

const TOKEN_INITIAL_MINT = '31415000000000000000000000'
const MIN_TX_LIMIT = '10000000000'
const MAX_TX_LIMIT = '1000000000000'
const EXECUTION_MIN_LIMIT = '10000000001'
const EXECUTION_MAX_LIMIT = '1000000000001'


contract('EthToBncBridge', async (accounts) => {
  const validators = [accounts[2], accounts[3], accounts[4]]

  let token
  let bridge

  async function deployToken() {
    const contract = await Token.new({ from: accounts[0] })
    await contract.mint(accounts[1], TOKEN_INITIAL_MINT, { from: accounts[0] })

    return contract
  }

  async function deployBridge(options = {}) {
    if (!options.token) {
      token = await deployToken()
    }

    return await EthToBncBridge.new(
      options.threshold === undefined ? 2 : options.threshold,
      options.validators || validators,
      options.closeEpoch === undefined || options.closeEpoch,
      options.token || token.address,
      options.homeLimits || [MIN_TX_LIMIT, MAX_TX_LIMIT],
      options.foreignLimits || [EXECUTION_MIN_LIMIT, EXECUTION_MAX_LIMIT],
      options.rangeSize === undefined ? 15 : options.rangeSize
    )
  }

  describe('constructor', async () => {
    it('should initialize bridge', async () => {
      bridge = await deployBridge().should.be.fulfilled
      expect(await bridge.epoch()).to.bignumber.equal('0')
      expect(await bridge.nextEpoch()).to.bignumber.equal('1')
      expect(await bridge.getParties()).to.bignumber.equal('0')
      expect(await bridge.getNextParties()).to.bignumber.equal('3')
      expect(await bridge.getNextValidators()).to.deep.equal(validators)
      expect(await bridge.getNextThreshold()).to.bignumber.equal('2')
      expect(await bridge.getNextCloseEpoch()).to.equal(true)
      expect(await bridge.getStartBlock()).to.bignumber.equal('0')
      expect(await bridge.minPerTxLimit()).to.bignumber.equal(MIN_TX_LIMIT)
      expect(await bridge.maxPerTxLimit()).to.bignumber.equal(MAX_TX_LIMIT)
      expect(await bridge.executionMinLimit()).to.bignumber.equal(EXECUTION_MIN_LIMIT)
      expect(await bridge.executionMaxLimit()).to.bignumber.equal(EXECUTION_MAX_LIMIT)
      expect(await bridge.rangeSize()).to.bignumber.equal('15')
      expect(await bridge.rangeSizeVersion()).to.bignumber.equal('0')
      expect(await bridge.rangeSizeStartBlock()).to.bignumber.above('0')
      expect(await bridge.state()).to.bignumber.equal(State.KEYGEN)
      expect(await bridge.tokenContract()).to.equal(token.address)

      const { logs } = await getDeployResult(bridge)

      expectEventInLogs(logs, 'NewEpoch', {
        oldEpoch: '0',
        newEpoch: '1'
      })
    })

    it('should not accept 0 threshold', async () => {
      await deployBridge({
        threshold: 0
      }).should.be.rejected
    })

    it('should not accept 0 range size', async () => {
      await deployBridge({
        rangeSize: 0
      }).should.be.rejected
    })

    it('should accept threshold up to number of validators', async () => {
      await deployBridge({
        threshold: 3
      }).should.be.fulfilled
      await deployBridge({
        threshold: 4
      }).should.be.rejected
    })

    it('should accept only valid home limits', async () => {
      await deployBridge({
        homeLimits: ['100', MAX_TX_LIMIT]
      }).should.be.rejected
      await deployBridge({
        homeLimits: [MIN_TX_LIMIT, '100']
      }).should.be.rejected
      await deployBridge({
        homeLimits: ['100', '100']
      }).should.be.rejected
      await deployBridge({
        homeLimits: [MIN_TX_LIMIT, MIN_TX_LIMIT]
      }).should.be.fulfilled
    })

    it('should accept only valid execution limits', async () => {
      await deployBridge({
        foreignLimits: ['100', MAX_TX_LIMIT]
      }).should.be.rejected
      await deployBridge({
        foreignLimits: [MIN_TX_LIMIT, '100']
      }).should.be.rejected
      await deployBridge({
        foreignLimits: ['100', '100']
      }).should.be.rejected
      await deployBridge({
        foreignLimits: [MIN_TX_LIMIT, MIN_TX_LIMIT]
      }).should.be.fulfilled
    })
  })

  describe('signatures checks', async () => {
    const message = '0x010203'
    const messageHash = keccak256(message)
    let signature1
    let signature2
    let signature3

    before(async () => {
      bridge = await deployBridge()
      signature1 = stripHex(await sign(validators[0], message))
      signature2 = stripHex(await sign(validators[1], message))
      signature3 = stripHex(await sign(validators[2], message))
    })

    it('should accept 2 or 3 correct signatures', async () => {
      await bridge.checkSignedMessage(1, messageHash, `0x${signature1}${signature2}`).should.be.fulfilled
      await bridge.checkSignedMessage(1, messageHash, `0x${signature2}${signature1}`).should.be.fulfilled
      await bridge.checkSignedMessage(1, messageHash, `0x${signature2}${signature3}`).should.be.fulfilled
      await bridge.checkSignedMessage(1, messageHash, `0x${signature3}${signature1}`).should.be.fulfilled
      await bridge.checkSignedMessage(1, messageHash, `0x${signature1}${signature2}${signature3}`).should.be.fulfilled
      await bridge.checkSignedMessage(1, messageHash, `0x${signature3}${signature1}${signature2}`).should.be.fulfilled
    })

    it('should not accept empty signatures', async () => {
      await bridge.checkSignedMessage(1, messageHash, '0x').should.be.rejected
    })

    it('should not accept signatures of wrong length', async () => {
      await bridge.checkSignedMessage(1, messageHash, `0x${signature1}${signature2}00`).should.be.rejected
    })

    it('should not accept 1 correct signature', async () => {
      await bridge.checkSignedMessage(1, messageHash, `0x${signature1}`).should.be.rejected
    })

    it('should not accept message with 0 epoch', async () => {
      await bridge.checkSignedMessage(0, messageHash, `0x${signature1}${signature2}`).should.be.rejected
    })

    it('should not accept repeated correct signatures as valid', async () => {
      await bridge.checkSignedMessage(1, messageHash, `0x${signature1}${signature1}`).should.be.rejected
      await bridge.checkSignedMessage(1, messageHash, `0x${signature1}${signature2}${signature1}`).should.be.fulfilled
    })

    it('should accept signatures if enough valid signatures', async () => {
      const wrongSignature = stripHex(await sign(accounts[5], message))

      await bridge.checkSignedMessage(1, messageHash, `0x${signature1}${wrongSignature}`).should.be.rejected
      await bridge.checkSignedMessage(1, messageHash, `0x${signature1}${signature2}${wrongSignature}`).should.be.fulfilled
    })
  })

  describe('actions', async () => {
    const confirmKeygenMessage11 = buildMessage(Action.CONFIRM_KEYGEN, 1, '1111111111111111111111111111111111111111')
    const confirmKeygenMessage12 = buildMessage(Action.CONFIRM_KEYGEN, 1, '2222222222222222222222222222222222222222')
    const confirmKeygenMessage1err = buildMessage(Action.CONFIRM_KEYGEN, 1)
    const startVotingMessage1 = buildMessage(Action.START_VOTING, 1)
    const startVotingMessage1err = buildMessage(Action.START_VOTING, 1, '0000000000000000000000000000000000000000000000000000000000')
    const confirmCloseEpochMessage1 = buildMessage(Action.CONFIRM_CLOSE_EPOCH, 1)
    const confirmCloseEpochMessage1err = buildMessage(Action.CONFIRM_CLOSE_EPOCH, 1, '0000000000000000000000000000000000000000000000000000000000')
    const removeValidatorMessage111 = buildMessage(Action.REMOVE_VALIDATOR, 1, stripHex(validators[0]), '000000000000000000')
    const removeValidatorMessage112 = buildMessage(Action.REMOVE_VALIDATOR, 1, stripHex(validators[0]), '0123456789abcdef01')
    const removeValidatorMessage12 = buildMessage(Action.REMOVE_VALIDATOR, 1, stripHex(validators[1]), '000000000000000000')
    const removeValidatorMessage13 = buildMessage(Action.REMOVE_VALIDATOR, 1, stripHex(validators[2]), '000000000000000000')
    const removeValidatorMessage14 = buildMessage(Action.REMOVE_VALIDATOR, 1, stripHex(accounts[5]), '000000000000000000')
    const removeValidatorMessage1err = buildMessage(Action.REMOVE_VALIDATOR, 1)
    const addValidatorMessage111 = buildMessage(Action.ADD_VALIDATOR, 1, stripHex(validators[0]), '000000000000000000')
    const addValidatorMessage112 = buildMessage(Action.ADD_VALIDATOR, 1, stripHex(validators[0]), '000000000000000001')
    const addValidatorMessage14 = buildMessage(Action.ADD_VALIDATOR, 1, stripHex(accounts[5]), '000000000000000001')
    const addValidatorMessage1err = buildMessage(Action.ADD_VALIDATOR, 1)
    const changeThresholdMessage10 = buildMessage(Action.CHANGE_THRESHOLD, 1, '0000', '000000000000000000000000000000000000000000000000000000')
    const changeThresholdMessage11 = buildMessage(Action.CHANGE_THRESHOLD, 1, '0001', '000000000000000000000000000000000000000000000000000000')
    const changeThresholdMessage13 = buildMessage(Action.CHANGE_THRESHOLD, 1, '0003', '000000000000000000000000000000000000000000000000000000')
    const changeThresholdMessage14 = buildMessage(Action.CHANGE_THRESHOLD, 1, '0004', '000000000000000000000000000000000000000000000000000000')
    const changeThresholdMessage1err = buildMessage(Action.CHANGE_THRESHOLD, 1)
    const changeCloseEpochMessage10 = buildMessage(Action.CHANGE_CLOSE_EPOCH, 1, '00', '00000000000000000000000000000000000000000000000000000000')
    const changeCloseEpochMessage11 = buildMessage(Action.CHANGE_CLOSE_EPOCH, 1, '01', '00000000000000000000000000000000000000000000000000000000')
    const changeCloseEpochMessage1err = buildMessage(Action.CHANGE_CLOSE_EPOCH, 1)
    const startKeygenMessage11 = buildMessage(Action.START_KEYGEN, 1, '0000000000000000000000000000000000000000000000000000000000')
    const startKeygenMessage12 = buildMessage(Action.START_KEYGEN, 1, '0000000000000000000000000000000000000000000000000000000001')
    const startKeygenMessage1err = buildMessage(Action.START_KEYGEN, 1)
    const confirmFundsTransferMessage1 = buildMessage(Action.CONFIRM_FUNDS_TRANSFER, 1)
    const confirmFundsTransferMessage1err = buildMessage(Action.CONFIRM_FUNDS_TRANSFER, 1, '0000000000000000000000000000000000000000000000000000000000')
    const cancelKeygenMessage1 = buildMessage(Action.CANCEL_KEYGEN, 1, '0000000000000000000000000000000000000000000000000000000000')
    const cancelKeygenMessage21 = buildMessage(Action.CANCEL_KEYGEN, 2, '0000000000000000000000000000000000000000000000000000000000')
    const cancelKeygenMessage22 = buildMessage(Action.CANCEL_KEYGEN, 2, '0000000000000000000000000000000000000000000000000000000001')
    const cancelKeygenMessage2err = buildMessage(Action.CANCEL_KEYGEN, 2)
    const confirmKeygenMessage2 = buildMessage(Action.CONFIRM_KEYGEN, 2, '3333333333333333333333333333333333333333')
    const startVotingMessage2 = buildMessage(Action.START_VOTING, 2)
    const transferMessage15min = buildMessage(
      Action.TRANSFER,
      '1111111111111111111111111111111111111111111111111111111111111111',
      stripHex(accounts[5]),
      '0000000000000002540be401'
    )
    const transferMessage15min1s = buildMessage(
      Action.TRANSFER,
      '1111111111111111111111111111111111111111111111111111111111111111',
      stripHex(accounts[5]),
      '0000000000000002540be402'
    )
    const transferMessage15max = buildMessage(
      Action.TRANSFER,
      '2222222222222222222222222222222222222222222222222222222222222222',
      stripHex(accounts[5]),
      '00000000000000e8d4a51001'
    )
    const transferMessage15low = buildMessage(
      Action.TRANSFER,
      '1111111111111111111111111111111111111111111111111111111111111111',
      stripHex(accounts[5]),
      '000000000000000000000064'
    )
    const transferMessage15high = buildMessage(
      Action.TRANSFER,
      '1111111111111111111111111111111111111111111111111111111111111111',
      stripHex(accounts[5]),
      '00000000000000e8d4a51002'
    )
    const transferMessage1err = buildMessage(Action.TRANSFER, 1)
    const changeMinPerTxLimit1 = buildMessage(Action.CHANGE_MIN_PER_TX_LIMIT, 1, '0000000000000002540be401', '0000000000000000000000000000000000')
    const changeMinPerTxLimit1high = buildMessage(Action.CHANGE_MIN_PER_TX_LIMIT, 1, '100000000000000000000000', '0000000000000000000000000000000000')
    const changeMinPerTxLimit1low = buildMessage(Action.CHANGE_MIN_PER_TX_LIMIT, 1, '000000000000000000000064', '0000000000000000000000000000000000')
    const changeMinPerTxLimit1err = buildMessage(Action.CHANGE_MIN_PER_TX_LIMIT, 1)
    const changeMaxPerTxLimit1 = buildMessage(Action.CHANGE_MAX_PER_TX_LIMIT, 1, '00000000000000e8d4a51001', '0000000000000000000000000000000000')
    const changeMaxPerTxLimit1low = buildMessage(Action.CHANGE_MAX_PER_TX_LIMIT, 1, '000000000000000000000064', '0000000000000000000000000000000000')
    const changeMaxPerTxLimit1err = buildMessage(Action.CHANGE_MAX_PER_TX_LIMIT, 1)
    const decreaseExecutionMinLimit1low = buildMessage(Action.DECREASE_EXECUTION_MIN_TX_LIMIT, 1, '000000000000000000000064', '0000000000000000000000000000000000')
    const decreaseExecutionMinLimit11 = buildMessage(Action.DECREASE_EXECUTION_MIN_TX_LIMIT, 1, '0000000000000002540be400', '0000000000000000000000000000000000')
    const decreaseExecutionMinLimit12 = buildMessage(Action.DECREASE_EXECUTION_MIN_TX_LIMIT, 1, '0000000000000002540be401', '0000000000000000000000000000000000')
    const decreaseExecutionMinLimit1err = buildMessage(Action.DECREASE_EXECUTION_MIN_TX_LIMIT, 1)
    const increaseExecutionMaxLimit1low = buildMessage(Action.INCREASE_EXECUTION_MAX_TX_LIMIT, 1, '000000000000000000000064', '0000000000000000000000000000000000')
    const increaseExecutionMaxLimit11 = buildMessage(Action.INCREASE_EXECUTION_MAX_TX_LIMIT, 1, '00000000000000e8d4a51002', '0000000000000000000000000000000000')
    const increaseExecutionMaxLimit12 = buildMessage(Action.INCREASE_EXECUTION_MAX_TX_LIMIT, 1, '00000000000000e8d4a51001', '0000000000000000000000000000000000')
    const increaseExecutionMaxLimit1err = buildMessage(Action.INCREASE_EXECUTION_MAX_TX_LIMIT, 1)
    const changeRangeSizeMessage10 = buildMessage(Action.CHANGE_RANGE_SIZE, 1, '0000', '000000000000000000000000000000000000000000000000000000')
    const changeRangeSizeMessage11 = buildMessage(Action.CHANGE_RANGE_SIZE, 1, '0001', '000000000000000000000000000000000000000000000000000000')
    const changeRangeSizeMessage1max = buildMessage(Action.CHANGE_RANGE_SIZE, 1, 'ffff', '000000000000000000000000000000000000000000000000000000')
    const changeRangeSizeMessage1err = buildMessage(Action.CHANGE_RANGE_SIZE, 1)
    const unknownMessage = buildMessage(
      Action.UNKNOWN_MESSAGE,
      1
    )
    const invalidMessage = buildMessage(Action.CONFIRM_KEYGEN, 1, '00')
    const validMessages = [
      confirmKeygenMessage11, confirmKeygenMessage12, confirmKeygenMessage1err, startVotingMessage1,
      startVotingMessage1err, confirmCloseEpochMessage1, confirmCloseEpochMessage1err,
      removeValidatorMessage111, removeValidatorMessage112, removeValidatorMessage12,
      removeValidatorMessage13, removeValidatorMessage14, removeValidatorMessage1err,
      addValidatorMessage111, addValidatorMessage112, addValidatorMessage14,
      addValidatorMessage1err, changeThresholdMessage10, changeThresholdMessage11,
      changeThresholdMessage13, changeThresholdMessage14, changeThresholdMessage1err,
      changeCloseEpochMessage10, changeCloseEpochMessage11, changeCloseEpochMessage1err,
      startKeygenMessage11, startKeygenMessage12, startKeygenMessage1err,
      confirmFundsTransferMessage1, confirmFundsTransferMessage1err, cancelKeygenMessage1,
      cancelKeygenMessage21, cancelKeygenMessage22, cancelKeygenMessage2err, confirmKeygenMessage2,
      startVotingMessage2, transferMessage15min, transferMessage15max, transferMessage15low,
      transferMessage15high, transferMessage1err, changeMinPerTxLimit1, changeMinPerTxLimit1high,
      changeMinPerTxLimit1low, changeMinPerTxLimit1err, changeMaxPerTxLimit1,
      changeMaxPerTxLimit1low, changeMaxPerTxLimit1err, decreaseExecutionMinLimit1low,
      decreaseExecutionMinLimit11, decreaseExecutionMinLimit12, decreaseExecutionMinLimit1err,
      increaseExecutionMaxLimit1low, increaseExecutionMaxLimit11, increaseExecutionMaxLimit12,
      increaseExecutionMaxLimit1err, changeRangeSizeMessage10, changeRangeSizeMessage11,
      changeRangeSizeMessage1max, changeRangeSizeMessage1err, unknownMessage, invalidMessage
    ]

    const validSignatures = {}

    async function applyMessage(message, customBridge = bridge) {
      return await customBridge.applyMessage(message, validSignatures[message])
    }

    before(async () => {
      validSignatures[transferMessage15min1s] = await sign(validators[0], transferMessage15min1s)
      for (let i = 0; i < validMessages.length; i += 1) {
        const message = validMessages[i]

        const [signature1, signature2, signature3] = (await Promise.all(
          validators.map(
            (validator) => sign(validator, message).then(stripHex)
          )
        ))

        validSignatures[message] = `0x${signature1}${signature2}${signature3}`
      }
    })

    describe('keygen completion', async () => {
      beforeEach(async () => {
        bridge = await deployBridge()
      })

      it('should complete keygen', async () => {
        const { logs } = await applyMessage(confirmKeygenMessage11).should.be.fulfilled
        expectEventInLogs(logs, 'EpochStart', {
          foreignAddress: '0x1111111111111111111111111111111111111111'
        })
        expectEventInLogs(logs, 'AppliedMessage', {
          message: confirmKeygenMessage11
        })

        expect(await bridge.epoch()).to.bignumber.equal('1')
        expect(await bridge.nextEpoch()).to.bignumber.equal('1')
        expect(await bridge.getParties()).to.bignumber.equal('3')
        expect(await bridge.getValidators()).to.deep.equal(validators)
        expect(await bridge.getThreshold()).to.bignumber.equal('2')
        expect(await bridge.getStartBlock()).to.bignumber.above('0')
        expect(await bridge.getCloseEpoch()).to.equal(true)
        expect(await bridge.state()).to.bignumber.equal(State.READY)
      })

      it('should not accept already applied message', async () => {
        const signature1 = stripHex(await sign(validators[0], confirmKeygenMessage11))
        const signature2 = stripHex(await sign(validators[1], confirmKeygenMessage11))

        await applyMessage(confirmKeygenMessage11)
        await bridge.checkSignedMessage(1, keccak256(confirmKeygenMessage11), `0x${signature1}${signature2}`).should.be.rejected
      })

      it('should not accept invalid length message', async () => {
        await applyMessage(invalidMessage).should.be.rejected
      })

      it('should not be able to apply keygen confirm message for 2nd epoch', async () => {
        await applyMessage(confirmKeygenMessage2).should.be.rejected
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(confirmKeygenMessage2).should.be.rejected
      })

      it('should not be able to apply different keygen confirm message for 1st epoch', async () => {
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(confirmKeygenMessage12).should.be.rejected
      })

      it('should not accept message with wrong length', async () => {
        await applyMessage(confirmKeygenMessage1err).should.be.rejected
      })
    })

    describe('start voting', async () => {
      it('should start voting with close epoch enabled', async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)

        const { logs } = await applyMessage(startVotingMessage1).should.be.fulfilled
        expectEventInLogs(logs, 'ForceSign')
        expectEventInLogs(logs, 'EpochClose', {
          epoch: '1'
        })
        expect(await bridge.epoch()).to.bignumber.equal('1')
        expect(await bridge.nextEpoch()).to.bignumber.equal('2')
        expect(await bridge.getValidators()).to.deep.equal(validators)
        expect(await bridge.getNextValidators()).to.deep.equal(validators)
        expect(await bridge.getThreshold()).to.bignumber.equal('2')
        expect(await bridge.getNextThreshold()).to.bignumber.equal('2')
        expect(await bridge.getCloseEpoch()).to.equal(true)
        expect(await bridge.getNextCloseEpoch()).to.equal(true)
        expect(await bridge.state()).to.bignumber.equal(State.CLOSING_EPOCH)
      })

      it('should start voting with close epoch disabled', async () => {
        bridge = await deployBridge({
          closeEpoch: false
        })
        await applyMessage(confirmKeygenMessage11)

        const { logs } = await applyMessage(startVotingMessage1).should.be.fulfilled
        expectEventInLogs(logs, 'ForceSign')
        expectEventInLogs(logs, 'EpochEnd', {
          epoch: '1'
        })
        expect(await bridge.getCloseEpoch()).to.equal(false)
        expect(await bridge.getNextCloseEpoch()).to.equal(false)
        expect(await bridge.state()).to.bignumber.equal(State.VOTING)
      })

      it('should not be able to start voting for 2nd epoch', async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(startVotingMessage1)
        await applyMessage(startVotingMessage2).should.be.rejected
      })

      it('should not accept message with wrong length', async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(startVotingMessage1err).should.be.rejected
      })
    })

    describe('close epoch', async () => {
      it('should confirm closing epoch', async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(startVotingMessage1)
        const { logs } = await applyMessage(confirmCloseEpochMessage1).should.be.fulfilled
        expectEventInLogs(logs, 'EpochEnd', {
          epoch: '1'
        })
        expect(await bridge.state()).to.bignumber.equal(State.VOTING)
        expect(await bridge.epoch()).to.bignumber.equal('1')
        expect(await bridge.nextEpoch()).to.bignumber.equal('2')
      })

      it('should not be able to confirm closing epoch with disabled closing epoch', async () => {
        bridge = await deployBridge({
          closeEpoch: false
        })
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(startVotingMessage1)
        await applyMessage(confirmCloseEpochMessage1).should.be.rejected
      })

      it('should not accept message with wrong length', async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(startVotingMessage1)
        await applyMessage(confirmCloseEpochMessage1err).should.be.rejected
      })

      it('should fail to confirm close epoch in ready state', async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(confirmCloseEpochMessage1).should.be.rejected
      })
    })

    describe('next epoch changes', async () => {
      beforeEach(async function () {
        if (!this.currentTest.skipBeforeEach) {
          bridge = await deployBridge({
            closeEpoch: false
          })
          await applyMessage(confirmKeygenMessage11)
          await applyMessage(startVotingMessage1)
        }
      })

      describe('remove validator', async () => {
        it('should remove first validator', async () => {
          await applyMessage(removeValidatorMessage111).should.be.fulfilled
          expect(await bridge.getValidators()).to.deep.equal(validators)
          expect(await bridge.getNextValidators()).to.have.members(validators.slice(1))
          expect(await bridge.getParties()).to.bignumber.equal('3')
          expect(await bridge.getNextParties()).to.bignumber.equal('2')
        })

        it('should remove first validator using custom attempt id', async () => {
          await applyMessage(removeValidatorMessage112).should.be.fulfilled
          expect(await bridge.getValidators()).to.deep.equal(validators)
          expect(await bridge.getNextValidators()).to.have.members(validators.slice(1))
        })

        it('should remove second validator', async () => {
          await applyMessage(removeValidatorMessage12).should.be.fulfilled
          expect(await bridge.getValidators()).to.deep.equal(validators)
          expect(await bridge.getNextValidators()).to.have.members([validators[0], validators[2]])
        })

        it('should remove last validator', async () => {
          await applyMessage(removeValidatorMessage13).should.be.fulfilled
          expect(await bridge.getValidators()).to.deep.equal(validators)
          expect(await bridge.getNextValidators()).to.have.members(validators.slice(0, 2))
        })

        it('should fail to remove unknown account', async () => {
          await applyMessage(removeValidatorMessage14).should.be.rejected
        })

        it('should fail to remove already removed validator', async () => {
          await applyMessage(removeValidatorMessage111)
          await applyMessage(removeValidatorMessage112).should.be.rejected
        })

        it('should not accept message with wrong length', async () => {
          await applyMessage(removeValidatorMessage1err).should.be.rejected
        })

        it('should fail to remove validator in ready state', async () => {
          bridge = await deployBridge()
          await applyMessage(confirmKeygenMessage11)
          await applyMessage(removeValidatorMessage12).should.be.rejected
        }).skipBeforeEach = true
      })

      describe('add validator', async () => {
        it('should add new validator', async () => {
          await applyMessage(addValidatorMessage14).should.be.fulfilled
          expect(await bridge.getValidators()).to.deep.equal(validators)
          expect(await bridge.getNextValidators()).to.have.members([...validators, accounts[5]])
          expect(await bridge.getParties()).to.bignumber.equal('3')
          expect(await bridge.getNextParties()).to.bignumber.equal('4')
        })

        it('should add removed validator', async () => {
          await applyMessage(removeValidatorMessage111)
          await applyMessage(addValidatorMessage111).should.be.fulfilled
          expect(await bridge.getValidators()).to.deep.equal(validators)
          expect(await bridge.getNextValidators()).to.have.members(validators)
        })

        it('should add removed validator twice', async () => {
          await applyMessage(removeValidatorMessage111)
          await applyMessage(addValidatorMessage111)
          await applyMessage(removeValidatorMessage112)
          await applyMessage(addValidatorMessage112).should.be.fulfilled
          expect(await bridge.getValidators()).to.deep.equal(validators)
          expect(await bridge.getNextValidators()).to.have.members(validators)
        })

        it('should fail to add existing validator', async () => {
          await applyMessage(addValidatorMessage111).should.be.rejected
        })

        it('should fail to add already added new validator', async () => {
          await applyMessage(removeValidatorMessage111)
          await applyMessage(addValidatorMessage111)
          await applyMessage(addValidatorMessage112).should.be.rejected
        })

        it('should not accept message with wrong length', async () => {
          await applyMessage(addValidatorMessage1err).should.be.rejected
        })

        it('should fail to add validator in ready state', async () => {
          bridge = await deployBridge()
          await applyMessage(confirmKeygenMessage11)
          await applyMessage(addValidatorMessage111).should.be.rejected
        }).skipBeforeEach = true
      })

      describe('change threshold', async () => {
        it('should not accept 0 threshold', async () => {
          await applyMessage(changeThresholdMessage10).should.be.rejected
        })

        it('should set threshold to 1', async () => {
          await applyMessage(changeThresholdMessage11).should.be.fulfilled
          expect(await bridge.getThreshold()).to.bignumber.equal('2')
          expect(await bridge.getNextThreshold()).to.bignumber.equal('1')
        })

        it('should set threshold to number of validators', async () => {
          await applyMessage(changeThresholdMessage13).should.be.fulfilled
          expect(await bridge.getThreshold()).to.bignumber.equal('2')
          expect(await bridge.getNextThreshold()).to.bignumber.equal('3')
        })

        it('should fail to remove validator, if threshold is too high', async () => {
          await applyMessage(changeThresholdMessage13)
          await applyMessage(removeValidatorMessage111).should.be.rejected
        })

        it('should fail to set too high threshold', async () => {
          await applyMessage(changeThresholdMessage14).should.be.rejected
        })

        it('should not accept message with wrong length', async () => {
          await applyMessage(changeThresholdMessage1err).should.be.rejected
        })

        it('should fail to change threshold in ready state', async () => {
          bridge = await deployBridge()
          await applyMessage(confirmKeygenMessage11)
          await applyMessage(changeThresholdMessage13).should.be.rejected
        }).skipBeforeEach = true
      })

      describe('change close epoch', async () => {
        it('should enable closing epoch', async () => {
          await applyMessage(changeCloseEpochMessage11).should.be.fulfilled
          expect(await bridge.getCloseEpoch()).to.equal(false)
          expect(await bridge.getNextCloseEpoch()).to.equal(true)
        })

        it('should disable closing epoch', async () => {
          await applyMessage(changeCloseEpochMessage11)
          await applyMessage(changeCloseEpochMessage10).should.be.fulfilled
          expect(await bridge.getCloseEpoch()).to.equal(false)
          expect(await bridge.getNextCloseEpoch()).to.equal(false)
        })

        it('should not accept message with wrong length', async () => {
          await applyMessage(changeCloseEpochMessage1err).should.be.rejected
        })

        it('should fail to change range size in ready state', async () => {
          bridge = await deployBridge()
          await applyMessage(confirmKeygenMessage11)
          await applyMessage(changeCloseEpochMessage10).should.be.rejected
        }).skipBeforeEach = true
      })
    })

    describe('not epoch-related changes', async () => {
      beforeEach(async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)
      })

      describe('change range size', async () => {
        it('should not accept 0 range size', async () => {
          await applyMessage(changeRangeSizeMessage10).should.be.rejected
        })

        it('should accept range size 1', async () => {
          const startBlock = await bridge.rangeSizeStartBlock()
          const { logs } = await applyMessage(changeRangeSizeMessage11).should.be.fulfilled
          expect(await bridge.rangeSize()).to.bignumber.equal('1')
          expect(await bridge.rangeSizeVersion()).to.bignumber.equal('1')
          expect(await bridge.rangeSizeStartBlock()).to.bignumber.above(startBlock)
          expectEventInLogs(logs, 'ForceSign')
        })

        it('should set max allowed range size', async () => {
          await applyMessage(changeRangeSizeMessage1max).should.be.fulfilled
          expect(await bridge.rangeSize()).to.bignumber.equal('65535')
        })

        it('should change range size twice', async () => {
          await applyMessage(changeRangeSizeMessage11)
          const startBlock = await bridge.rangeSizeStartBlock()
          await applyMessage(changeRangeSizeMessage1max).should.be.fulfilled
          expect(await bridge.rangeSize()).to.bignumber.equal('65535')
          expect(await bridge.rangeSizeVersion()).to.bignumber.equal('2')
          expect(await bridge.rangeSizeStartBlock()).to.bignumber.above(startBlock)
        })

        it('should not accept message with wrong length', async () => {
          await applyMessage(changeRangeSizeMessage1err).should.be.rejected
        })
      })

      describe('change min per tx limit', async () => {
        it('should not accept too low limit', async () => {
          await applyMessage(changeMinPerTxLimit1low).should.be.rejected
        })

        it('should not accept limit higher than max per tx limit', async () => {
          await applyMessage(changeMinPerTxLimit1high).should.be.rejected
        })

        it('should accept valid min limit', async () => {
          await applyMessage(changeMinPerTxLimit1).should.be.fulfilled
          expect(await bridge.minPerTxLimit()).to.bignumber.equal('10000000001')
        })

        it('should not accept message with wrong length', async () => {
          await applyMessage(changeMinPerTxLimit1err).should.be.rejected
        })
      })

      describe('change max per tx limit', async () => {
        it('should not accept too low limit', async () => {
          await applyMessage(changeMaxPerTxLimit1low).should.be.rejected
        })

        it('should accept valid max limit', async () => {
          await applyMessage(changeMaxPerTxLimit1).should.be.fulfilled
          expect(await bridge.maxPerTxLimit()).to.bignumber.equal('1000000000001')
        })

        it('should not accept message with wrong length', async () => {
          await applyMessage(changeMaxPerTxLimit1err).should.be.rejected
        })
      })

      describe('decrease execution min limit', async () => {
        it('should not accept too low limit', async () => {
          await applyMessage(decreaseExecutionMinLimit1low).should.be.rejected
        })

        it('should accept valid execution min limit', async () => {
          await applyMessage(decreaseExecutionMinLimit11).should.be.fulfilled
          expect(await bridge.executionMinLimit()).to.bignumber.equal('10000000000')
        })

        it('should not allow to increase limit', async () => {
          await applyMessage(decreaseExecutionMinLimit11)
          await applyMessage(decreaseExecutionMinLimit12).should.be.rejected
        })

        it('should not accept message with wrong length', async () => {
          await applyMessage(decreaseExecutionMinLimit1err).should.be.rejected
        })
      })

      describe('increase execution max limit', async () => {
        it('should not accept too low limit', async () => {
          await applyMessage(increaseExecutionMaxLimit1low).should.be.rejected
        })

        it('should accept valid execution max limit', async () => {
          await applyMessage(increaseExecutionMaxLimit11).should.be.fulfilled
          expect(await bridge.executionMaxLimit()).to.bignumber.equal('1000000000002')
        })

        it('should not allow to decrease limit', async () => {
          await applyMessage(increaseExecutionMaxLimit11)
          await applyMessage(increaseExecutionMaxLimit12).should.be.rejected
        })

        it('should not accept message with wrong length', async () => {
          await applyMessage(increaseExecutionMaxLimit1err).should.be.rejected
        })
      })
    })

    describe('start keygen', async () => {
      beforeEach(async function () {
        if (!this.currentTest.skipBeforeEach) {
          bridge = await deployBridge({
            closeEpoch: false
          })
          await applyMessage(confirmKeygenMessage11)
          await applyMessage(startVotingMessage1)
        }
      })

      it('should start keygen for 2nd epoch', async () => {
        const { logs } = await applyMessage(startKeygenMessage11).should.be.fulfilled
        expectEventInLogs(logs, 'NewEpoch', {
          oldEpoch: '1',
          newEpoch: '2'
        })
        expect(await bridge.state()).to.bignumber.equal(State.KEYGEN)
        expect(await bridge.epoch()).to.bignumber.equal('1')
        expect(await bridge.nextEpoch()).to.bignumber.equal('2')
      })

      it('should confirm keygen for 2nd epoch', async () => {
        await applyMessage(startKeygenMessage11)
        const { logs } = await applyMessage(confirmKeygenMessage2).should.be.fulfilled
        expectEventInLogs(logs, 'NewFundsTransfer', {
          oldEpoch: '1',
          newEpoch: '2'
        })
      })

      it('should not accept keygen confirmation for for past epoch', async () => {
        await applyMessage(startKeygenMessage11)
        await applyMessage(confirmKeygenMessage12).should.be.rejected
      })

      it('should not accept message with wrong length', async () => {
        await applyMessage(startKeygenMessage1err).should.be.rejected
      })

      it('should fail to start keygen in ready state', async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(startKeygenMessage11).should.be.rejected
      }).skipBeforeEach = true
    })

    describe('confirm funds transfer', async () => {
      beforeEach(async function () {
        if (!this.currentTest.skipBeforeEach) {
          bridge = await deployBridge({
            closeEpoch: false
          })
          await applyMessage(confirmKeygenMessage11)
          await applyMessage(startVotingMessage1)
          await applyMessage(startKeygenMessage11)
        }
      })

      it('should start funds transfer', async () => {
        await applyMessage(confirmKeygenMessage2).should.be.fulfilled
        expect(await bridge.state()).to.bignumber.equal(State.FUNDS_TRANSFER)
        expect(await bridge.epoch()).to.bignumber.equal('1')
        expect(await bridge.nextEpoch()).to.bignumber.equal('2')
      })

      it('should confirm funds transfer', async () => {
        await applyMessage(confirmKeygenMessage2)
        const { logs } = await applyMessage(confirmFundsTransferMessage1).should.be.fulfilled
        expectEventInLogs(logs, 'EpochStart', {
          foreignAddress: '0x3333333333333333333333333333333333333333'
        })
        expect(await bridge.state()).to.bignumber.equal(State.READY)
        expect(await bridge.epoch()).to.bignumber.equal('2')
        expect(await bridge.nextEpoch()).to.bignumber.equal('2')
        expect(await bridge.getValidators()).to.deep.equal(validators)
        expect(await bridge.getThreshold()).to.bignumber.equal('2')
        expect(await bridge.getCloseEpoch()).to.equal(false)
      })

      it('should not accept message with wrong length', async () => {
        await applyMessage(confirmFundsTransferMessage1err).should.be.rejected
      })

      it('should fail to confirm funds transfer in ready state', async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(confirmFundsTransferMessage1).should.be.rejected
      }).skipBeforeEach = true
    })

    describe('cancel keygen', async () => {
      beforeEach(async function () {
        if (!this.currentTest.skipBeforeEach) {
          bridge = await deployBridge({
            closeEpoch: false
          })
          await applyMessage(confirmKeygenMessage11)
          await applyMessage(startVotingMessage1)
          await applyMessage(startKeygenMessage11)
        }
      })

      it('should not be able to cancel keygen for 1st epoch', async () => {
        bridge = await deployBridge({
          closeEpoch: false
        })
        await applyMessage(cancelKeygenMessage1).should.be.rejected
      }).skipBeforeEach = true

      it('should cancel keygen for 2nd epoch', async () => {
        const { logs } = await applyMessage(cancelKeygenMessage21).should.be.fulfilled
        expectEventInLogs(logs, 'NewEpochCancelled', {
          epoch: '2'
        })
        expect(await bridge.state()).to.bignumber.equal(State.VOTING)
        expect(await bridge.epoch()).to.bignumber.equal('1')
        expect(await bridge.nextEpoch()).to.bignumber.equal('2')
      })

      it('should restart keygen for 2nd epoch', async () => {
        await applyMessage(cancelKeygenMessage21)
        await applyMessage(startKeygenMessage12).should.be.fulfilled
        expect(await bridge.state()).to.bignumber.equal(State.KEYGEN)
        expect(await bridge.epoch()).to.bignumber.equal('1')
        expect(await bridge.nextEpoch()).to.bignumber.equal('2')
      })

      it('should cancel keygen for 2nd epoch twice', async () => {
        await applyMessage(cancelKeygenMessage21)
        await applyMessage(startKeygenMessage12)
        await applyMessage(cancelKeygenMessage22).should.be.fulfilled
        expect(await bridge.state()).to.bignumber.equal(State.VOTING)
        expect(await bridge.epoch()).to.bignumber.equal('1')
        expect(await bridge.nextEpoch()).to.bignumber.equal('2')
      })

      it('should not accept message with wrong length', async () => {
        await applyMessage(cancelKeygenMessage2err).should.be.rejected
      })

      it('should fail to confirm funds transfer in ready state', async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(cancelKeygenMessage21).should.be.rejected
      }).skipBeforeEach = true
    })

    describe('transfer', async () => {
      beforeEach(async () => {
        token = await deployToken()
        bridge = await deployBridge({
          closeEpoch: false,
          token: token.address
        })
        await applyMessage(confirmKeygenMessage11)
      })

      it('should transfer tokens', async () => {
        await token.transfer(bridge.address, EXECUTION_MIN_LIMIT, { from: accounts[1] })
        await applyMessage(transferMessage15min).should.be.fulfilled
        expect(await token.balanceOf(bridge.address)).to.bignumber.equal('0')
        expect(await token.balanceOf(accounts[5])).to.bignumber.equal(EXECUTION_MIN_LIMIT)
        expect(await token.allowance(bridge.address, accounts[5])).to.bignumber.equal('0')
      })

      it('should approve min number of tokens', async () => {
        await applyMessage(transferMessage15min).should.be.fulfilled
        expect(await token.balanceOf(bridge.address)).to.bignumber.equal('0')
        expect(await token.balanceOf(accounts[5])).to.bignumber.equal('0')
        expect(
          await token.allowance(bridge.address, accounts[5])
        ).to.bignumber.equal(EXECUTION_MIN_LIMIT)
      })

      it('should approve max number of tokens', async () => {
        await token.transfer(bridge.address, EXECUTION_MIN_LIMIT, { from: accounts[1] })
        await applyMessage(transferMessage15max).should.be.fulfilled
        expect(await token.balanceOf(bridge.address)).to.bignumber.equal(EXECUTION_MIN_LIMIT)
        expect(await token.balanceOf(accounts[5])).to.bignumber.equal('0')
        expect(
          await token.allowance(bridge.address, accounts[5])
        ).to.bignumber.equal(EXECUTION_MAX_LIMIT)
      })

      it('should not accept too low/high execution value', async () => {
        await applyMessage(transferMessage15low).should.be.rejected
        await applyMessage(transferMessage15high).should.be.rejected
      })

      it('should request transfer message reschedule', async () => {
        const { logs } = await applyMessage(transferMessage15min1s).should.be.fulfilled
        expectEventInLogs(logs, 'RescheduleTransferMessage', {
          msgHash: keccak256(transferMessage15min1s)
        })
        expect(await token.balanceOf(bridge.address)).to.bignumber.equal('0')
        expect(await token.balanceOf(accounts[5])).to.bignumber.equal('0')
        expect(
          await token.allowance(bridge.address, accounts[5])
        ).to.bignumber.equal('0')
      })

      it('should not accept message with wrong length', async () => {
        await applyMessage(transferMessage1err).should.be.rejected
      })
    })

    describe('unknown message', async () => {
      it('should revert if receive unknown message', async () => {
        bridge = await deployBridge()
        await applyMessage(confirmKeygenMessage11)
        await applyMessage(unknownMessage).should.be.rejected
      })
    })

    describe('exchange request', async () => {
      it('should accept exchange request', async () => {
        token = await deployToken()
        token.transfer(accounts[5], MIN_TX_LIMIT, { from: accounts[1] })
        bridge = await deployBridge({
          token: token.address,
          closeEpoch: false
        })
        await token.approve(bridge.address, MIN_TX_LIMIT, { from: accounts[5] })
        await applyMessage(confirmKeygenMessage11)
        const { logs } = await bridge.exchange(
          MIN_TX_LIMIT,
          { from: accounts[5] }
        ).should.be.fulfilled
        expectEventInLogs(logs, 'ExchangeRequest', {
          value: MIN_TX_LIMIT,
          nonce: '0'
        })
      })

      it('should not accept exchange in keygen state', async () => {
        token = await deployToken()
        token.transfer(accounts[5], MIN_TX_LIMIT, { from: accounts[1] })
        bridge = await deployBridge({
          token: token.address,
          closeEpoch: false
        })
        await token.approve(bridge.address, MIN_TX_LIMIT, { from: accounts[5] })
        await bridge.exchange(MIN_TX_LIMIT, { from: accounts[5] }).should.be.rejected
      })

      it('should not accept exchange request with too low value', async () => {
        token = await deployToken()
        token.transfer(accounts[5], MIN_TX_LIMIT, { from: accounts[1] })
        bridge = await deployBridge({
          token: token.address,
          closeEpoch: false
        })
        await token.approve(bridge.address, MIN_TX_LIMIT, { from: accounts[5] })
        await applyMessage(confirmKeygenMessage11)
        await bridge.exchange('100', { from: accounts[5] }).should.be.rejected
      })

      it('should not accept exchange request with too high value', async () => {
        token = await deployToken()
        token.transfer(accounts[5], `${MAX_TX_LIMIT}0`, { from: accounts[1] })
        bridge = await deployBridge({
          token: token.address,
          closeEpoch: false
        })
        await token.approve(bridge.address, `${MAX_TX_LIMIT}0`, { from: accounts[5] })
        await applyMessage(confirmKeygenMessage11)
        await bridge.exchange(`${MAX_TX_LIMIT}0`, { from: accounts[5] }).should.be.rejected
      })

      it('should fail with not enough allowance', async () => {
        token = await deployToken()
        token.transfer(accounts[5], MAX_TX_LIMIT, { from: accounts[1] })
        bridge = await deployBridge({
          token: token.address,
          closeEpoch: false
        })
        await token.approve(bridge.address, MIN_TX_LIMIT, { from: accounts[5] })
        await applyMessage(confirmKeygenMessage11)
        await bridge.exchange(MAX_TX_LIMIT, { from: accounts[5] }).should.be.rejected
      })

      it('should assign different nonces to exchange requests with range size 3', async () => {
        token = await deployToken()
        token.transfer(accounts[5], MAX_TX_LIMIT, { from: accounts[1] })
        bridge = await deployBridge({
          token: token.address,
          closeEpoch: false,
          rangeSize: 3
        })
        await token.approve(bridge.address, MAX_TX_LIMIT, { from: accounts[5] })
        await applyMessage(confirmKeygenMessage11)

        for (let i = 0; i < 10; i += 1) {
          const { logs } = await bridge.exchange(
            MIN_TX_LIMIT,
            { from: accounts[5] }
          ).should.be.fulfilled
          expectEventInLogs(logs, 'ExchangeRequest', {
            value: MIN_TX_LIMIT,
            nonce: Math.floor((i + 1) / 3).toString()
          })
        }
      })

      it('should assign different nonces to exchange requests with range size 1', async () => {
        token = await deployToken()
        token.transfer(accounts[5], MAX_TX_LIMIT, { from: accounts[1] })
        bridge = await deployBridge({
          token: token.address,
          closeEpoch: false,
          rangeSize: 1
        })
        await token.approve(bridge.address, MAX_TX_LIMIT, { from: accounts[5] })
        await applyMessage(confirmKeygenMessage11)

        for (let i = 0; i < 4; i += 1) {
          const { logs } = await bridge.exchange(
            MIN_TX_LIMIT,
            { from: accounts[5] }
          ).should.be.fulfilled
          expectEventInLogs(logs, 'ExchangeRequest', {
            value: MIN_TX_LIMIT,
            nonce: i.toString()
          })
        }
      })

      it('should assign different nonces with respect to relative block number', async () => {
        token = await deployToken()
        token.transfer(accounts[5], MAX_TX_LIMIT, { from: accounts[1] })
        bridge = await deployBridge({
          token: token.address,
          closeEpoch: false,
          rangeSize: 3
        })
        await token.approve(bridge.address, MAX_TX_LIMIT, { from: accounts[5] })
        await applyMessage(confirmKeygenMessage11) // start block X

        // block X + 1
        const { logs: logs1 } = await bridge.exchange(MIN_TX_LIMIT, { from: accounts[5] })
        expectEventInLogs(logs1, 'ExchangeRequest', {
          nonce: '0'
        })
        await skipBlocks(1)
        // block X + 3
        const { logs: logs2 } = await bridge.exchange(MIN_TX_LIMIT, { from: accounts[5] })
        expectEventInLogs(logs2, 'ExchangeRequest', {
          nonce: '1'
        })
        // block X + 4
        const { logs: logs3 } = await bridge.exchange(MIN_TX_LIMIT, { from: accounts[5] })
        expectEventInLogs(logs3, 'ExchangeRequest', {
          nonce: '1'
        })
        await skipBlocks(4)
        for (let i = 0; i < 3; i += 1) {
          // block X + 9, X + 10, X + 11
          const { logs } = await bridge.exchange(MIN_TX_LIMIT, { from: accounts[5] })
          expectEventInLogs(logs, 'ExchangeRequest', {
            nonce: '2'
          })
        }
        // block X + 12
        const { logs } = await bridge.exchange(MIN_TX_LIMIT, { from: accounts[5] })
        expectEventInLogs(logs, 'ExchangeRequest', {
          nonce: '3'
        })
      })
    })
  })
})
