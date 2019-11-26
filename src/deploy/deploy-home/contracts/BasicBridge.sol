pragma solidity ^0.5.0;

import './openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';

contract BasicBridge {
    uint32 constant UPPER_BOUND = 0xffffffff;

    event EpochEnd(uint16 indexed epoch);
    event EpochClose(uint16 indexed epoch);
    event ForceSign();
    event NewEpoch(uint16 indexed oldEpoch, uint16 indexed newEpoch);
    event NewEpochCancelled(uint16 indexed epoch);
    event NewFundsTransfer(uint16 indexed oldEpoch, uint16 indexed newEpoch);
    event EpochStart(uint16 indexed epoch, uint x, uint y);

    struct State {
        address[] validators;
        uint32 startBlock;
        uint32 endBlock;
        uint32 nonce;
        uint16 threshold;
        uint16 rangeSize;
        bool closeEpoch;
        uint x;
        uint y;
    }

    enum Status {
        READY, // bridge is in ready to perform operations
        CLOSING_EPOCH, // generating transaction for blocking binance side of the bridge
        VOTING, // voting for changing in next epoch, but still ready
        KEYGEN, //keygen, can be cancelled
        FUNDS_TRANSFER // funds transfer, cannot be cancelled
    }

    mapping(uint16 => State) public states;

    Status public status;

    uint16 public epoch;
    uint16 public nextEpoch;

    uint96 minTxLimit;
    uint96 maxTxLimit;

    IERC20 public tokenContract;

    modifier ready {
        require(status == Status.READY, "Not in ready state");
        _;
    }

    modifier closingEpoch {
        require(status == Status.CLOSING_EPOCH, "Not in closing epoch state");
        _;
    }

    modifier voting {
        require(status == Status.VOTING, "Not in voting state");
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

    function getParties() view public returns (uint16) {
        return getParties(epoch);
    }

    function getNextParties() view public returns (uint16) {
        return getParties(nextEpoch);
    }

    function getParties(uint16 _epoch) view public returns (uint16) {
        return uint16(states[_epoch].validators.length);
    }

    function getThreshold() view public returns (uint16) {
        return getThreshold(epoch);
    }

    function getNextThreshold() view public returns (uint16) {
        return getThreshold(nextEpoch);
    }

    function getThreshold(uint16 _epoch) view public returns (uint16) {
        return states[_epoch].threshold;
    }

    function getStartBlock() view public returns (uint32) {
        return getStartBlock(epoch);
    }

    function getStartBlock(uint16 _epoch) view public returns (uint32) {
        return states[_epoch].startBlock;
    }

    function getRangeSize() view public returns (uint16) {
        return getRangeSize(epoch);
    }

    function getNextRangeSize() view public returns (uint16) {
        return getRangeSize(nextEpoch);
    }

    function getRangeSize(uint16 _epoch) view public returns (uint16) {
        return states[_epoch].rangeSize;
    }

    function getNonce() view public returns (uint32) {
        return getNonce(epoch);
    }

    function getNonce(uint16 _epoch) view public returns (uint32) {
        return states[_epoch].nonce;
    }

    function getX() view public returns (uint) {
        return getX(epoch);
    }

    function getX(uint16 _epoch) view public returns (uint) {
        return states[_epoch].x;
    }

    function getY() view public returns (uint) {
        return getY(epoch);
    }

    function getY(uint16 _epoch) view public returns (uint) {
        return states[_epoch].y;
    }

    function getCloseEpoch() view public returns (bool) {
        return getCloseEpoch(epoch);
    }

    function getNextCloseEpoch() view public returns (bool) {
        return getCloseEpoch(nextEpoch);
    }

    function getCloseEpoch(uint16 _epoch) view public returns (bool) {
        return states[_epoch].closeEpoch;
    }

    function getPartyId() view public returns (uint16) {
        address[] memory validators = getValidators();
        for (uint i = 0; i < getParties(); i++) {
            if (validators[i] == msg.sender)
                return uint16(i + 1);
        }
        return 0;
    }

    function getNextPartyId(address a) view public returns (uint16) {
        address[] memory validators = getNextValidators();
        for (uint i = 0; i < getNextParties(); i++) {
            if (validators[i] == a)
                return uint16(i + 1);
        }
        return 0;
    }

    function getValidators() view public returns (address[] memory) {
        return getValidators(epoch);
    }

    function getNextValidators() view public returns (address[] memory) {
        return getValidators(nextEpoch);
    }

    function getValidators(uint16 _epoch) view public returns (address[] memory) {
        return states[_epoch].validators;
    }
}
