pragma solidity ^0.5.0;

import './openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';

contract BasicBridge {
    uint constant UPPER_BOUND = uint(-1);

    event EpochEnd(uint indexed epoch);
    event EpochClose(uint indexed epoch);
    event ForceSign();
    event NewEpoch(uint indexed oldEpoch, uint indexed newEpoch);
    event NewEpochCancelled(uint indexed epoch);
    event NewFundsTransfer(uint indexed oldEpoch, uint indexed newEpoch);
    event EpochStart(uint indexed epoch, uint x, uint y);

    struct State {
        address[] validators;
        uint threshold;
        uint rangeSize;
        uint startBlock;
        uint endBlock;
        uint nonce;
        uint x;
        uint y;
        bool closeEpoch;
    }

    enum Status {
        READY, // bridge is in ready to perform operations
        CLOSING_EPOCH, // generating transaction for blocking binance side of the bridge
        VOTING, // voting for changing in next epoch, but still ready
        KEYGEN, //keygen, can be cancelled
        FUNDS_TRANSFER // funds transfer, cannot be cancelled
    }

    mapping(uint => State) states;

    Status public status;

    uint public epoch;
    uint public nextEpoch;

    uint minTxLimit;
    uint maxTxLimit;

    IERC20 public tokenContract;

    modifier ready {
        require(status == Status.READY, "Not in ready state");
        _;
    }

    modifier closingEpoch {
        require(status == Status.CLOSING_EPOCH, "Not in closing epoch state");
        _;
    }

    modifier readyOrClosing {
        require(status == Status.READY || status == Status.CLOSING_EPOCH, "Not in ready or closing epoch state");
        _;
    }

    modifier voting {
        require(status == Status.VOTING, "Not in voting state");
        _;
    }

    modifier readyOrVoting {
        require(status == Status.READY || status == Status.VOTING, "Not in ready or voting state");
        _;
    }

    modifier keygen {
        require(status == Status.KEYGEN, "Not in keygen state");
        _;
    }

    modifier fundsTransfer {
        require(status == Status.FUNDS_TRANSFER, "Not in funds transfer state");
        _;
    }

    modifier currentValidator {
        require(getPartyId() != 0, "Not a current validator");
        _;
    }

    function getParties() view public returns (uint) {
        return getParties(epoch);
    }

    function getNextParties() view public returns (uint) {
        return getParties(nextEpoch);
    }

    function getParties(uint _epoch) view public returns (uint) {
        return states[_epoch].validators.length;
    }

    function getThreshold() view public returns (uint) {
        return getThreshold(epoch);
    }

    function getNextThreshold() view public returns (uint) {
        return getThreshold(nextEpoch);
    }

    function getThreshold(uint _epoch) view public returns (uint) {
        return states[_epoch].threshold;
    }

    function getStartBlock() view public returns (uint) {
        return getStartBlock(epoch);
    }

    function getStartBlock(uint _epoch) view public returns (uint) {
        return states[_epoch].startBlock;
    }

    function getRangeSize() view public returns (uint) {
        return getRangeSize(epoch);
    }

    function getNextRangeSize() view public returns (uint) {
        return getRangeSize(nextEpoch);
    }

    function getRangeSize(uint _epoch) view public returns (uint) {
        return states[_epoch].rangeSize;
    }

    function getNonce() view public returns (uint) {
        return getNonce(epoch);
    }

    function getNonce(uint _epoch) view public returns (uint) {
        return states[_epoch].nonce;
    }

    function getX() view public returns (uint) {
        return states[epoch].x;
    }

    function getY() view public returns (uint) {
        return states[epoch].y;
    }

    function getCloseEpoch() view public returns (bool) {
        return getCloseEpoch(epoch);
    }

    function getNextCloseEpoch() view public returns (bool) {
        return getCloseEpoch(nextEpoch);
    }

    function getCloseEpoch(uint _epoch) view public returns (bool) {
        return states[_epoch].closeEpoch;
    }

    function getPartyId() view public returns (uint) {
        address[] memory validators = getValidators();
        for (uint i = 0; i < getParties(); i++) {
            if (validators[i] == msg.sender)
                return i + 1;
        }
        return 0;
    }

    function getNextPartyId(address a) view public returns (uint) {
        address[] memory validators = getNextValidators();
        for (uint i = 0; i < getNextParties(); i++) {
            if (validators[i] == a)
                return i + 1;
        }
        return 0;
    }

    function getValidators() view public returns (address[] memory) {
        return getValidators(epoch);
    }

    function getNextValidators() view public returns (address[] memory) {
        return getValidators(nextEpoch);
    }

    function getValidators(uint _epoch) view public returns (address[] memory) {
        return states[_epoch].validators;
    }
}
