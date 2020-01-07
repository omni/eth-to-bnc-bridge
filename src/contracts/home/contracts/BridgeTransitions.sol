pragma solidity ^0.5.0;

import "./BridgeEpochs.sol";
import "./BridgeStates.sol";
import "./BridgeConfig.sol";

contract BridgeTransitions is BridgeEpochs, BridgeStates, BridgeConfig {
    event EpochEnd(uint16 indexed epoch);
    event EpochClose(uint16 indexed epoch);
    event ForceSign();
    event NewEpoch(uint16 indexed oldEpoch, uint16 indexed newEpoch);
    event NewEpochCancelled(uint16 indexed epoch);
    event NewFundsTransfer(uint16 indexed oldEpoch, uint16 indexed newEpoch);
    event EpochStart(uint16 indexed epoch, bytes20 foreignAddress);
    event RangeSizeChanged(uint16 rangeSize);

    function _confirmKeygen(bytes20 foreignAddress) internal keygen {
        epochStates[nextEpoch].foreignAddress = foreignAddress;
        if (nextEpoch == 1) {
            state = State.READY;
            epochStates[nextEpoch].startBlock = uint32(block.number);
            epoch = nextEpoch;
            rangeSizeStartBlock = uint32(block.number);
            emit EpochStart(epoch, foreignAddress);
        } else {
            state = State.FUNDS_TRANSFER;
            emit NewFundsTransfer(epoch, nextEpoch);
        }
    }

    function _confirmFundsTransfer() internal fundsTransfer {
        state = State.READY;
        epochStates[nextEpoch].startBlock = uint32(block.number);
        epoch = nextEpoch;
        rangeSizeStartBlock = uint32(block.number);
        emit EpochStart(epoch, getForeignAddress());
    }

    function _confirmCloseEpoch() internal closingEpoch {
        state = State.VOTING;
        emit EpochEnd(epoch);
    }

    function _startVoting() internal ready {
        nextEpoch++;
        _initNextEpoch(getValidators(), getThreshold(), getCloseEpoch());

        if (getCloseEpoch()) {
            state = State.CLOSING_EPOCH;
            emit EpochClose(epoch);
        } else {
            state = State.VOTING;
            emit EpochEnd(epoch);
        }

        _forceSign();
    }

    function _addValidator(address validator) internal voting {
        require(getNextPartyId(validator) == 0, "Already a validator");

        epochStates[nextEpoch].validators.push(validator);
    }

    function _removeValidator(address validator) internal voting {
        require(getNextPartyId(validator) != 0, "Already not a validator");
        require(getNextParties() > getNextThreshold(), "Threshold is too high");

        uint16 lastPartyId = getNextParties() - 1;
        address[] memory nextValidators = getNextValidators();

        for (uint i = 0; i < lastPartyId; i++) {
            if (nextValidators[i] == validator) {
                epochStates[nextEpoch].validators[i] = nextValidators[lastPartyId];
                break;
            }
        }
        epochStates[nextEpoch].validators.pop();
    }

    function _changeThreshold(uint16 threshold) internal voting {
        require(threshold > 0, "Invalid threshold value");
        require(threshold <= getNextParties(), "Should be less than or equal to parties number");

        epochStates[nextEpoch].threshold = threshold;
    }

    function _changeCloseEpoch(bool closeEpoch) internal voting {
        epochStates[nextEpoch].closeEpoch = closeEpoch;
    }

    function _startKeygen() internal voting {
        state = State.KEYGEN;

        emit NewEpoch(epoch, nextEpoch);
    }

    function _cancelKeygen() internal keygen {
        require(epoch > 0, "Cannot cancel keygen for first epoch");
        state = State.VOTING;

        emit NewEpochCancelled(nextEpoch);
    }

    function _transfer(address to, uint96 value) internal {
        require(value >= executionMinLimit && value <= executionMaxLimit, "Value lies outside of the allowed limits");
        if (tokenContract.balanceOf(address(this)) >= value) {
            tokenContract.transfer(to, value);
        } else {
            tokenContract.approve(to, value);
        }
    }

    function _changeMinPerTxLimit(uint96 limit) internal {
        require(limit >= LIMITS_LOWER_BOUND && limit <= maxPerTxLimit, "Invalid limit");
        minPerTxLimit = limit;
    }

    function _changeMaxPerTxLimit(uint96 limit) internal {
        require(limit >= minPerTxLimit, "Invalid limit");
        maxPerTxLimit = limit;
    }

    function _increaseExecutionMaxLimit(uint96 limit) internal {
        require(limit > executionMaxLimit, "Invalid limit");
        executionMaxLimit = limit;
    }

    function _decreaseExecutionMinLimit(uint96 limit) internal {
        require(limit >= LIMITS_LOWER_BOUND && limit < executionMinLimit, "Invalid limit");
        executionMinLimit = limit;
    }

    function _changeRangeSize(uint16 _rangeSize) internal {
        require(_rangeSize > 0, "Invalid range size");

        rangeSize = _rangeSize;
        rangeSizeStartBlock = uint32(block.number);
        _forceSign();

        emit RangeSizeChanged(rangeSize);
    }

    function _forceSign() internal {
        // to guarantee, that the next processed range id will be a new one
        rangeSizeVersion++;
        emit ForceSign();
    }
}
