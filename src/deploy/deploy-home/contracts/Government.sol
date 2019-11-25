pragma solidity ^0.5.0;

import "./BasicBridge.sol";

contract Government is BasicBridge {
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

    function _confirmKeygen(uint x, uint y) internal keygen {
        states[nextEpoch].x = x;
        states[nextEpoch].y = y;
        states[nextEpoch].nonce = UPPER_BOUND;
        if (nextEpoch == 1) {
            status = Status.READY;
            states[nextEpoch].startBlock = uint32(block.number);
            epoch = nextEpoch;
            emit EpochStart(epoch, x, y);
        }
        else {
            status = Status.FUNDS_TRANSFER;
            emit NewFundsTransfer(epoch, nextEpoch);
        }
    }

    function _confirmFundsTransfer() internal fundsTransfer {
        require(epoch > 0, "First epoch does not need funds transfer");

        status = Status.READY;
        states[nextEpoch].startBlock = uint32(block.number);
        epoch = nextEpoch;
        emit EpochStart(epoch, getX(), getY());
    }

    function _confirmCloseEpoch() internal closingEpoch {
        status = Status.VOTING;
        emit EpochEnd(epoch);
    }

    function _startVoting() internal ready {
        states[epoch].endBlock = uint32(block.number);
        nextEpoch++;
        states[nextEpoch].threshold = getThreshold();
        states[nextEpoch].validators = getValidators();
        states[nextEpoch].rangeSize = getRangeSize();
        states[nextEpoch].closeEpoch = getCloseEpoch();

        if (getCloseEpoch()) {
            status = Status.CLOSING_EPOCH;
            emit ForceSign();
            emit EpochClose(epoch);
        } else {
            status = Status.VOTING;
            emit ForceSign();
            emit EpochEnd(epoch);
        }
    }

    function _addValidator(address validator) internal voting {
        require(getNextPartyId(validator) == 0, "Already a validator");

        states[nextEpoch].validators.push(validator);
    }

    function _removeValidator(address validator) internal voting {
        require(getNextPartyId(validator) != 0, "Already not a validator");

        uint16 lastPartyId = getNextParties() - 1;
        for (uint i = 0; i < lastPartyId; i++) {
            if (states[nextEpoch].validators[i] == validator) {
                states[nextEpoch].validators[i] = getNextValidators()[lastPartyId];
                break;
            }
        }
        delete states[nextEpoch].validators[lastPartyId];
        states[nextEpoch].validators.length--;
    }

    function _changeThreshold(uint16 threshold) internal voting {
        require(threshold > 0, "Invalid threshold value");

        states[nextEpoch].threshold = threshold;
    }

    function _changeRangeSize(uint16 rangeSize) internal voting {
        require(rangeSize > 0, "Invalid range size");

        states[nextEpoch].rangeSize = rangeSize;
    }

    function _changeCloseEpoch(bool closeEpoch) internal voting {
        states[nextEpoch].closeEpoch = closeEpoch;
    }

    function _startKeygen() internal voting {
        require(getNextThreshold() <= getNextParties(), "Invalid threshold number");

        status = Status.KEYGEN;

        emit NewEpoch(epoch, nextEpoch);
    }

    function _cancelKeygen() internal keygen {
        status = Status.VOTING;

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
