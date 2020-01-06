pragma solidity ^0.5.0;

import "./BridgeEpochs.sol";
import "./BridgeStates.sol";

contract BridgeTransitions is BridgeEpochs, BridgeStates {
    event EpochEnd(uint16 indexed epoch);
    event EpochClose(uint16 indexed epoch);
    event ForceSign();
    event NewEpoch(uint16 indexed oldEpoch, uint16 indexed newEpoch);
    event NewEpochCancelled(uint16 indexed epoch);
    event NewFundsTransfer(uint16 indexed oldEpoch, uint16 indexed newEpoch);
    event EpochStart(uint16 indexed epoch, bytes20 foreignAddress);

    enum Action {
        CONFIRM_KEYGEN,
        CONFIRM_FUNDS_TRANSFER,
        CONFIRM_CLOSE_EPOCH,
        VOTE_START_VOTING,
        VOTE_ADD_VALIDATOR,
        VOTE_REMOVE_VALIDATOR,
        VOTE_CHANGE_THRESHOLD,
        VOTE_CHANGE_RANGE_SIZE,
        VOTE_CHANGE_CLOSE_EPOCH,
        VOTE_START_KEYGEN,
        VOTE_CANCEL_KEYGEN,
        TRANSFER
    }

    IERC20 public tokenContract;

    function _confirmKeygen(bytes20 foreignAddress) internal keygen {
        epochStates[nextEpoch].foreignAddress = foreignAddress;
        if (nextEpoch == 1) {
            state = State.READY;
            epochStates[nextEpoch].startBlock = uint32(block.number);
            epoch = nextEpoch;
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
        emit EpochStart(epoch, getForeignAddress());
    }

    function _confirmCloseEpoch() internal closingEpoch {
        state = State.VOTING;
        emit EpochEnd(epoch);
    }

    function _startVoting() internal ready {
        nextEpoch++;
        _initNextEpoch(getValidators(), getThreshold(), getRangeSize(), getCloseEpoch(), getMinPerTx(), getMaxPerTx());

        if (getCloseEpoch()) {
            state = State.CLOSING_EPOCH;
            emit ForceSign();
            emit EpochClose(epoch);
        } else {
            state = State.VOTING;
            emit ForceSign();
            emit EpochEnd(epoch);
        }
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

    function _changeRangeSize(uint16 rangeSize) internal voting {
        require(rangeSize > 0, "Invalid range size");

        epochStates[nextEpoch].rangeSize = rangeSize;
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
        if (tokenContract.balanceOf(address(this)) >= value) {
            tokenContract.transfer(to, value);
        } else {
            tokenContract.approve(to, value);
        }
    }
}
