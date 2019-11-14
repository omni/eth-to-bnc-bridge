pragma solidity ^0.5.0;

import './openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';

contract Bridge {
    event ExchangeRequest(uint value, uint nonce);
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

    enum Vote {
        CONFIRM_KEYGEN,
        CONFIRM_FUNDS_TRANSFER,
        CONFIRM_CLOSE_EPOCH,
        START_VOTING,
        ADD_VALIDATOR,
        REMOVE_VALIDATOR,
        CHANGE_THRESHOLD,
        CHANGE_RANGE_SIZE,
        CHANGE_CLOSE_EPOCH,
        START_KEYGEN,
        CANCEL_KEYGEN,
        TRANSFER
    }

    mapping(uint => State) states;

    mapping(bytes32 => uint) public dbTransferCount;
    mapping(bytes32 => bool) public dbTransfer;
    mapping(bytes32 => uint) public votesCount;
    mapping(bytes32 => bool) public votes;
    mapping(bytes32 => bool) public usedRange;

    Status public status;

    uint public epoch;
    uint public nextEpoch;

    uint minTxLimit;
    uint maxTxLimit;

    constructor(uint threshold, address[] memory validators, address _tokenContract, uint[2] memory limits, uint rangeSize, bool closeEpoch) public {
        require(validators.length > 0);
        require(threshold <= validators.length);

        tokenContract = IERC20(_tokenContract);

        epoch = 0;
        status = Status.KEYGEN;
        nextEpoch = 1;

        states[nextEpoch] = State({
            validators : validators,
            threshold : threshold,
            rangeSize : rangeSize,
            startBlock : 0,
            endBlock : uint(- 1),
            nonce : uint(- 1),
            x : 0,
            y : 0,
            closeEpoch : closeEpoch
            });

        minTxLimit = limits[0];
        maxTxLimit = limits[1];

        emit NewEpoch(0, 1);
    }

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

    function exchange(uint value) public ready {
        require(value >= minTxLimit && value >= 10 ** 10 && value <= maxTxLimit);

        uint txRange = (block.number - getStartBlock()) / getRangeSize();
        if (!usedRange[keccak256(abi.encodePacked(txRange, epoch))]) {
            usedRange[keccak256(abi.encodePacked(txRange, epoch))] = true;
            states[epoch].nonce++;
        }

        tokenContract.transferFrom(msg.sender, address(this), value);
        emit ExchangeRequest(value, getNonce());
    }

    function transfer(bytes32 hash, address to, uint value) public readyOrClosing currentValidator {
        if (tryVote(Vote.TRANSFER, hash, to, value)) {
            tokenContract.transfer(to, value);
        }
    }

    function confirmKeygen(uint x, uint y) public keygen {
        require(getNextPartyId(msg.sender) != 0, "Not a next validator");

        if (tryConfirm(Vote.CONFIRM_KEYGEN, x, y)) {
            states[nextEpoch].x = x;
            states[nextEpoch].y = y;
            if (nextEpoch == 1) {
                status = Status.READY;
                states[nextEpoch].startBlock = block.number;
                states[nextEpoch].nonce = uint(- 1);
                epoch = nextEpoch;
                emit EpochStart(epoch, x, y);
            }
            else {
                status = Status.FUNDS_TRANSFER;
                emit NewFundsTransfer(epoch, nextEpoch);
            }
        }
    }

    function confirmFundsTransfer() public fundsTransfer currentValidator {
        require(epoch > 0, "First epoch does not need funds transfer");

        if (tryConfirm(Vote.CONFIRM_FUNDS_TRANSFER)) {
            status = Status.READY;
            states[nextEpoch].startBlock = block.number;
            states[nextEpoch].nonce = uint(- 1);
            epoch = nextEpoch;
            emit EpochStart(epoch, getX(), getY());
        }
    }

    function confirmCloseEpoch() public closingEpoch currentValidator {
        if (tryConfirm(Vote.CONFIRM_CLOSE_EPOCH)) {
            status = Status.VOTING;
            emit EpochEnd(epoch);
        }
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
        return states[epoch].validators;
    }

    function getNextValidators() view public returns (address[] memory) {
        return states[nextEpoch].validators;
    }

    function startVoting() public readyOrVoting currentValidator {
        if (tryVote(Vote.START_VOTING, epoch)) {
            nextEpoch++;
            states[nextEpoch].endBlock = block.number;
            states[nextEpoch].threshold = getThreshold();
            states[nextEpoch].validators = getValidators();
            states[nextEpoch].rangeSize = getRangeSize();
            states[nextEpoch].closeEpoch = getCloseEpoch();

            if (status == Status.READY && getCloseEpoch()) {
                status = Status.CLOSING_EPOCH;
                emit ForceSign();
                emit EpochClose(epoch);
            } else {
                status = Status.VOTING;
                emit ForceSign();
                emit EpochEnd(epoch);
            }
        }
    }

    function voteAddValidator(address validator) public voting currentValidator {
        require(getNextPartyId(validator) == 0, "Already a validator");

        if (tryVote(Vote.ADD_VALIDATOR, validator)) {
            states[nextEpoch].validators.push(validator);
        }
    }

    function voteRemoveValidator(address validator) public voting currentValidator {
        require(getNextPartyId(validator) != 0, "Already not a validator");

        if (tryVote(Vote.REMOVE_VALIDATOR, validator)) {
            _removeValidator(validator);
        }
    }

    function _removeValidator(address validator) private {
        for (uint i = 0; i < getNextParties() - 1; i++) {
            if (states[nextEpoch].validators[i] == validator) {
                states[nextEpoch].validators[i] = getNextValidators()[getNextParties() - 1];
                break;
            }
        }
        delete states[nextEpoch].validators[getNextParties() - 1];
        states[nextEpoch].validators.length--;
    }

    function voteChangeThreshold(uint threshold) public voting currentValidator {
        require(threshold > 0 && threshold <= getParties(), "Invalid threshold value");

        if (tryVote(Vote.CHANGE_THRESHOLD, threshold)) {
            states[nextEpoch].threshold = threshold;
        }
    }

    function voteChangeRangeSize(uint rangeSize) public voting currentValidator {
        if (tryVote(Vote.CHANGE_RANGE_SIZE, rangeSize)) {
            states[nextEpoch].rangeSize = rangeSize;
        }
    }

    function voteChangeCloseEpoch(bool closeEpoch) public voting currentValidator {
        if (tryVote(Vote.CHANGE_CLOSE_EPOCH, closeEpoch ? 1 : 0)) {
            states[nextEpoch].closeEpoch = closeEpoch;
        }
    }

    function voteStartKeygen() public voting currentValidator {
        require(getNextThreshold() <= getNextParties(), "Invalid threshold number");

        if (tryVote(Vote.START_KEYGEN)) {
            status = Status.KEYGEN;

            emit NewEpoch(epoch, nextEpoch);
        }
    }

    function voteCancelKeygen() public keygen currentValidator {
        if (tryVote(Vote.CANCEL_KEYGEN)) {
            status = Status.VOTING;

            emit NewEpochCancelled(nextEpoch);
        }
    }

    function tryVote(Vote voteType) private returns (bool) {
        bytes32 vote = keccak256(abi.encodePacked(voteType, nextEpoch));
        return putVote(vote);
    }

    function tryVote(Vote voteType, address addr) private returns (bool) {
        bytes32 vote = keccak256(abi.encodePacked(voteType, nextEpoch, addr));
        return putVote(vote);
    }

    function tryVote(Vote voteType, uint num) private returns (bool) {
        bytes32 vote = keccak256(abi.encodePacked(voteType, nextEpoch, num));
        return putVote(vote);
    }

    function tryVote(Vote voteType, bytes32 hash, address to, uint value) private returns (bool) {
        bytes32 vote = keccak256(abi.encodePacked(voteType, hash, to, value));
        return putVote(vote);
    }

    function tryConfirm(Vote voteType) private returns (bool) {
        bytes32 vote = keccak256(abi.encodePacked(voteType, nextEpoch));
        return putConfirm(vote);
    }

    function tryConfirm(Vote voteType, uint x, uint y) private returns (bool) {
        bytes32 vote = keccak256(abi.encodePacked(voteType, nextEpoch, x, y));
        return putConfirm(vote);
    }

    function putVote(bytes32 vote) private returns (bool) {
        bytes32 personalVote = personalizeVote(vote);
        require(!votes[personalVote], "Voted already");

        votes[personalVote] = true;
        if (votesCount[vote] + 1 == getThreshold()) {
            votesCount[vote] = 2 ** 255;
            return true;
        } else {
            votesCount[vote]++;
            return false;
        }
    }

    function putConfirm(bytes32 vote) private returns (bool) {
        bytes32 personalVote = personalizeVote(vote);
        require(!votes[personalVote], "Confirmed already");

        votes[personalVote] = true;
        if (votesCount[vote] + 1 == getNextThreshold()) {
            votesCount[vote] = 2 ** 255;
            return true;
        } else {
            votesCount[vote]++;
            return false;
        }
    }

    function personalizeVote(bytes32 vote) private view returns (bytes32) {
        return keccak256(abi.encodePacked(vote, msg.sender));
    }
}
