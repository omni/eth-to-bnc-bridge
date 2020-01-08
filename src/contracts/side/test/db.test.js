const { expect } = require('chai')

require('./setup')
const {
  sign, expectEventInLogs, expectEventNotInLogs, keccak256, stripHex
} = require('./utils')

const SharedDB = artifacts.require('SharedDB')
const ID1 = '0x0000000000000000000000000000000000000000000000000000000000000000'
const ID2 = '0x0000000000000000000000000000000000000000000000000000000000000001'
const ID3 = '0x0000000000000000000000000000000000000000000000000000000000000002'
const KEY1 = ID1
const KEY2 = ID2
const KEY3 = ID3

contract('SharedDB', async (accounts) => {
  let db

  beforeEach(async () => {
    db = await SharedDB.new()
  })

  describe('KeyValueStorage', async () => {
    it('should allow basic get and set operations for single account', async () => {
      await db.setData(ID1, KEY1, '0x01', { from: accounts[0] }).should.be.fulfilled
      await db.setData(ID2, KEY1, '0x0102', { from: accounts[0] }).should.be.fulfilled
      await db.setData(ID1, KEY2, '0x010203', { from: accounts[0] }).should.be.fulfilled

      expect(await db.getData(accounts[0], ID1, KEY1)).to.equal('0x01')
      expect(await db.getData(accounts[0], ID2, KEY1)).to.equal('0x0102')
      expect(await db.getData(accounts[0], ID1, KEY2)).to.equal('0x010203')
    })

    it('should overwrite existing data', async () => {
      await db.setData(ID1, KEY1, '0x01', { from: accounts[0] }).should.be.fulfilled
      expect(await db.getData(accounts[0], ID1, KEY1)).to.equal('0x01')

      await db.setData(ID1, KEY1, '0x02', { from: accounts[0] }).should.be.fulfilled
      expect(await db.getData(accounts[0], ID1, KEY1)).to.equal('0x02')
    })

    it('should not overwrite data for different authors', async () => {
      await db.setData(ID1, KEY1, '0x01', { from: accounts[0] }).should.be.fulfilled
      await db.setData(ID1, KEY1, '0x02', { from: accounts[1] }).should.be.fulfilled

      expect(await db.getData(accounts[0], ID1, KEY1)).to.equal('0x01')
      expect(await db.getData(accounts[1], ID1, KEY1)).to.equal('0x02')
    })

    it('should store data for several accounts', async () => {
      await db.setData(ID1, KEY1, '0x11', { from: accounts[0] }).should.be.fulfilled
      await db.setData(ID1, KEY2, '0x12', { from: accounts[0] }).should.be.fulfilled
      await db.setData(ID1, KEY3, '0x13', { from: accounts[0] }).should.be.fulfilled
      await db.setData(ID2, KEY2, '0x22', { from: accounts[0] }).should.be.fulfilled
      await db.setData(ID3, KEY1, '0x31', { from: accounts[0] }).should.be.fulfilled
      await db.setData(ID3, KEY2, '0x32', { from: accounts[0] }).should.be.fulfilled
      await db.setData(ID1, KEY1, '0x11', { from: accounts[1] }).should.be.fulfilled
      await db.setData(ID2, KEY2, '0x22', { from: accounts[1] }).should.be.fulfilled
      await db.setData(ID3, KEY3, '0x33', { from: accounts[1] }).should.be.fulfilled
      await db.setData(ID1, KEY3, '0x13', { from: accounts[2] }).should.be.fulfilled
      await db.setData(ID2, KEY3, '0x23', { from: accounts[2] }).should.be.fulfilled
      await db.setData(ID3, KEY3, '0x33', { from: accounts[2] }).should.be.fulfilled
      await db.setData(ID1, KEY2, '0x12', { from: accounts[2] }).should.be.fulfilled

      expect(await db.getData(accounts[0], ID1, KEY1)).to.equal('0x11')
      expect(await db.getData(accounts[0], ID1, KEY2)).to.equal('0x12')
      expect(await db.getData(accounts[0], ID1, KEY3)).to.equal('0x13')
      expect(await db.getData(accounts[0], ID2, KEY2)).to.equal('0x22')
      expect(await db.getData(accounts[0], ID3, KEY1)).to.equal('0x31')
      expect(await db.getData(accounts[0], ID3, KEY2)).to.equal('0x32')
      expect(await db.getData(accounts[1], ID1, KEY1)).to.equal('0x11')
      expect(await db.getData(accounts[1], ID2, KEY2)).to.equal('0x22')
      expect(await db.getData(accounts[1], ID3, KEY3)).to.equal('0x33')
      expect(await db.getData(accounts[2], ID2, KEY3)).to.equal('0x23')
      expect(await db.getData(accounts[2], ID3, KEY3)).to.equal('0x33')
      expect(await db.getData(accounts[2], ID1, KEY2)).to.equal('0x12')
    })
  })

  describe('SignedMessageStorage', async () => {
    const validMessages = [
      '0x000102',
      '0x000102030405060708090a0b0c0d0e0f10111213141516',
      '0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      '0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40'
    ]

    describe('add signature', async () => {
      for (let i = 0; i < validMessages.length; i += 1) {
        const message = validMessages[i]
        it('should add valid signature for message of length 3 bytes', async () => {
          const signature = await sign(accounts[0], message)
          const { logs } = await db.addSignature(
            message,
            signature,
            { from: accounts[0] }
          ).should.be.fulfilled
          expectEventInLogs(logs, 'NewMessage', {
            msgHash: keccak256(message)
          })
          expectEventInLogs(logs, 'NewSignature', {
            msgHash: keccak256(message),
            signer: accounts[0]
          })
        })
      }

      it('should now accept message of different length', async () => {
        const message = '0xff'
        const signature = await sign(accounts[0], message)
        await db.addSignature(message, signature, { from: accounts[0] }).should.be.rejected
      })

      it('should not accept invalid signature', async () => {
        const message = validMessages[0]
        const signature = await sign(accounts[1], message)
        await db.addSignature(message, signature, { from: accounts[0] }).should.be.rejected
      })

      it('should not accept signature of invalid length', async () => {
        const message = validMessages[0]
        const signature = `${await sign(accounts[0], message)}00`
        await db.addSignature(message, signature, { from: accounts[0] }).should.be.rejected
      })

      it('should add several signatures for one message', async () => {
        const message = validMessages[0]
        const signature1 = await sign(accounts[0], message)
        const signature2 = await sign(accounts[1], message)
        const { logs: logs1 } = await db.addSignature(
          message,
          signature1,
          { from: accounts[0] }
        ).should.be.fulfilled
        const { logs: logs2 } = await db.addSignature(
          message,
          signature2,
          { from: accounts[1] }
        ).should.be.fulfilled

        expectEventInLogs(logs1, 'NewMessage')
        expectEventInLogs(logs1, 'NewSignature', {
          msgHash: keccak256(message),
          signer: accounts[0]
        })
        expectEventNotInLogs(logs2, 'NewMessage')
        expectEventInLogs(logs2, 'NewSignature', {
          msgHash: keccak256(message),
          signer: accounts[1]
        })
      })

      it('should not rewrite existing signatures', async () => {
        const message = validMessages[0]
        const signature1 = await sign(accounts[0], message)
        const signature2 = await sign(accounts[0], message)
        const { logs: logs1 } = await db.addSignature(
          message,
          signature1,
          { from: accounts[0] }
        ).should.be.fulfilled
        const { logs: logs2 } = await db.addSignature(
          message,
          signature2,
          { from: accounts[0] }
        ).should.be.fulfilled

        expectEventInLogs(logs1, 'NewMessage')
        expectEventInLogs(logs1, 'NewSignature', {
          msgHash: keccak256(message),
          signer: accounts[0]
        })
        expectEventNotInLogs(logs2, 'NewMessage')
        expectEventNotInLogs(logs2, 'NewSignature')
      })
    })

    describe('get signatures', async () => {
      let signature1
      let signature2
      let signature3

      beforeEach(async () => {
        const message = validMessages[0]
        signature1 = await sign(accounts[0], message)
        signature2 = await sign(accounts[1], message)
        signature3 = await sign(accounts[2], message)
        await db.addSignature(message, signature1, { from: accounts[0] })
        await db.addSignature(message, signature2, { from: accounts[1] })
        await db.addSignature(message, signature3, { from: accounts[2] })
      })

      it('should return empty signatures', async () => {
        const signatures = await db.getSignatures(
          keccak256(validMessages[1]),
          [accounts[0], accounts[1], accounts[2]]
        ).should.be.fulfilled
        expect(signatures).to.a('null')
      })

      it('should return zero signatures for different validator set', async () => {
        const signatures = await db.getSignatures(
          keccak256(validMessages[0]),
          [accounts[3], accounts[4]]
        ).should.be.fulfilled
        expect(signatures).to.a('null')
      })

      it('should return one signature', async () => {
        const signatures = await db.getSignatures(
          keccak256(validMessages[0]),
          [accounts[0], accounts[4]]
        ).should.be.fulfilled
        expect(signatures).to.equal(signature1)
      })

      it('should return two signatures', async () => {
        const signatures = await db.getSignatures(
          keccak256(validMessages[0]),
          [accounts[0], accounts[1]]
        ).should.be.fulfilled
        expect(signatures).to.equal(`${signature1}${stripHex(signature2)}`)
      })

      it('should return three signatures', async () => {
        const signatures = await db.getSignatures(
          keccak256(validMessages[0]),
          [accounts[0], accounts[1], accounts[2], accounts[3]]
        ).should.be.fulfilled
        expect(signatures).to.equal(`${signature1}${stripHex(signature2)}${stripHex(signature3)}`)
      })
    })

    describe('send responsibility', async () => {
      for (let i = 0; i < 10; i += 1) {
        const message = `0xffff0${i}`
        it(`should evaluate if validator is responsible to send for message ${message}`, async () => {
          const hash = keccak256(message)
          const validators = [accounts[0], accounts[1], accounts[2]]
          const signature1 = await sign(accounts[0], message)
          const signature2 = await sign(accounts[1], message)
          const signature3 = await sign(accounts[2], message)

          const responsible01 = await db.isResponsibleToSend(hash, validators, 2, accounts[0])
          const responsible02 = await db.isResponsibleToSend(hash, validators, 2, accounts[1])
          const responsible03 = await db.isResponsibleToSend(hash, validators, 2, accounts[2])
          expect(responsible01).to.equal(false)
          expect(responsible02).to.equal(false)
          expect(responsible03).to.equal(false)

          await db.addSignature(message, signature1, { from: accounts[0] })
          const responsible11 = await db.isResponsibleToSend(hash, validators, 2, accounts[0])

          await db.addSignature(message, signature2, { from: accounts[1] })
          const responsible21 = await db.isResponsibleToSend(hash, validators, 2, accounts[0])
          const responsible22 = await db.isResponsibleToSend(hash, validators, 2, accounts[1])

          await db.addSignature(message, signature3, { from: accounts[2] })
          const responsible31 = await db.isResponsibleToSend(hash, validators, 2, accounts[0])
          const responsible32 = await db.isResponsibleToSend(hash, validators, 2, accounts[1])
          const responsible33 = await db.isResponsibleToSend(hash, validators, 2, accounts[2])
          // eslint-disable-next-line no-bitwise
          expect(responsible31 ^ responsible32).to.equal(1)
          expect(responsible33).to.equal(false)
          expect(responsible11).to.equal(responsible21)
          expect(responsible21).to.equal(responsible31)
          expect(responsible22).to.equal(responsible32)
        })
      }
    })
  })

  describe('SignupStorage', async () => {
    const hash1 = '0x0000000000000000000000000000000000000000000000000000000000000000'
    const hash2 = '0x0000000000000000000000000000000000000000000000000000000000000001'
    const validators = [accounts[1], accounts[2], accounts[3]]
    describe('signup', async () => {
      it('should be able to signup', async () => {
        await db.signup(hash1).should.be.fulfilled
      })

      it('should be able to signup only once', async () => {
        await db.signup(hash1)
        await db.signup(hash1).should.be.rejected
      })
    })

    describe('is signuped', async () => {
      it('should be able check signup status', async () => {
        expect(await db.isSignuped(hash1, validators[0])).to.equal(false)
        await db.signup(hash1, { from: validators[0] })
        expect(await db.isSignuped(hash1, validators[0])).to.equal(true)
        expect(await db.isSignuped(hash1, validators[1])).to.equal(false)
        expect(await db.isSignuped(hash1, validators[2])).to.equal(false)
        expect(await db.isSignuped(hash2, validators[0])).to.equal(false)
        expect(await db.isSignuped(hash2, validators[1])).to.equal(false)
        expect(await db.isSignuped(hash2, validators[2])).to.equal(false)
      })

      it('should be able to check signup status for several hashes', async () => {
        await db.signup(hash1, { from: validators[0] })
        await db.signup(hash2, { from: validators[0] })
        await db.signup(hash2, { from: validators[1] })

        expect(await db.isSignuped(hash1, validators[0])).to.equal(true)
        expect(await db.isSignuped(hash1, validators[1])).to.equal(false)
        expect(await db.isSignuped(hash1, validators[2])).to.equal(false)
        expect(await db.isSignuped(hash2, validators[0])).to.equal(true)
        expect(await db.isSignuped(hash2, validators[1])).to.equal(true)
        expect(await db.isSignuped(hash2, validators[2])).to.equal(false)
      })
    })

    describe('signup number', async () => {
      it('should return 0 for unsignuped', async () => {
        expect(await db.getSignupNumber(hash1, validators, validators[0])).to.bignumber.equal('0')
        expect(await db.getSignupNumber(hash1, validators, validators[1])).to.bignumber.equal('0')
        expect(await db.getSignupNumber(hash1, validators, validators[2])).to.bignumber.equal('0')
      })

      it('should return 0 with different validators set', async () => {
        await db.signup(hash1, { from: accounts[4] })
        await db.signup(hash1, { from: accounts[5] })
        await db.signup(hash1, { from: accounts[6] })

        expect(await db.getSignupNumber(hash1, validators, validators[0])).to.bignumber.equal('0')
        expect(await db.getSignupNumber(hash1, validators, validators[1])).to.bignumber.equal('0')
        expect(await db.getSignupNumber(hash1, validators, validators[2])).to.bignumber.equal('0')
      })

      it('should return correct signup numbers', async () => {
        await db.signup(hash1, { from: validators[0] })
        await db.signup(hash1, { from: validators[1] })
        await db.signup(hash1, { from: accounts[4] })
        await db.signup(hash1, { from: accounts[5] })

        expect(await db.getSignupNumber(hash1, validators, validators[0])).to.bignumber.equal('1')
        expect(await db.getSignupNumber(hash1, validators, validators[1])).to.bignumber.equal('2')
        expect(await db.getSignupNumber(hash1, validators, validators[2])).to.bignumber.equal('0')

        await db.signup(hash1, { from: validators[2] })

        expect(await db.getSignupNumber(hash1, validators, validators[2])).to.bignumber.equal('3')
      })

      it('should return correct signup numbers for several hashes', async () => {
        await db.signup(hash1, { from: accounts[4] })
        await db.signup(hash1, { from: validators[0] })
        await db.signup(hash1, { from: accounts[5] })
        await db.signup(hash1, { from: validators[1] })
        await db.signup(hash2, { from: accounts[4] })
        await db.signup(hash2, { from: validators[2] })
        await db.signup(hash2, { from: accounts[5] })

        expect(await db.getSignupNumber(hash1, validators, validators[0])).to.bignumber.equal('1')
        expect(await db.getSignupNumber(hash1, validators, validators[1])).to.bignumber.equal('2')
        expect(await db.getSignupNumber(hash1, validators, validators[2])).to.bignumber.equal('0')
        expect(await db.getSignupNumber(hash2, validators, validators[0])).to.bignumber.equal('0')
        expect(await db.getSignupNumber(hash2, validators, validators[1])).to.bignumber.equal('0')
        expect(await db.getSignupNumber(hash2, validators, validators[2])).to.bignumber.equal('1')

        await db.signup(hash1, { from: validators[2] })
        await db.signup(hash2, { from: validators[1] })
        await db.signup(hash2, { from: validators[0] })

        expect(await db.getSignupNumber(hash1, validators, validators[2])).to.bignumber.equal('3')
        expect(await db.getSignupNumber(hash2, validators, validators[0])).to.bignumber.equal('3')
        expect(await db.getSignupNumber(hash2, validators, validators[1])).to.bignumber.equal('2')
      })
    })

    describe('signup address', async () => {
      it('should return correct signup address', async () => {
        await db.signup(hash1, { from: validators[0] })
        await db.signup(hash1, { from: validators[1] })
        await db.signup(hash1, { from: validators[2] })
        await db.signup(hash1, { from: accounts[4] })
        await db.signup(hash1, { from: accounts[5] })

        expect(await db.getSignupAddress(hash1, validators, 1)).to.equal(validators[0])
        expect(await db.getSignupAddress(hash1, validators, 2)).to.equal(validators[1])
        expect(await db.getSignupAddress(hash1, validators, 3)).to.equal(validators[2])
        expect(await db.getSignupAddress(hash1, validators, 0)).to.equal('0x0000000000000000000000000000000000000000')
      })
    })
  })
})
