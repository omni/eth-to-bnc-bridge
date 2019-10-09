pragma solidity ^0.5.0;

import './openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';

contract Bridge {
    event ExchangeRequest(uint value);
    event NewEpoch(uint indexed oldEpoch, uint indexed newEpoch);
    event NewEpochCancelled(uint indexed epoch);
    event NewFundsTransfer(uint indexed oldEpoch, uint indexed newEpoch);
    event EpochStart(uint indexed epoch, uint x, uint y);

    struct State {
        address[] validators;
        uint threshold;
        uint x;
        uint y;
    }

    enum Status {
        READY, // bridge is in ready to perform operations
        VOTING, // voting for changing in next epoch, but still ready
        KEYGEN, //keygen, can be cancelled
        FUNDS_TRANSFER // funds transfer, cannot be cancelled
    }

    enum Vote {
        CONFIRM_KEYGEN,
        CONFIRM_FUNDS_TRANSFER,
        START_VOTING,
        ADD_VALIDATOR,
        REMOVE_VALIDATOR,
        CHANGE_THRESHOLD,
        START_KEYGEN,
        CANCEL_KEYGEN,
        TRANSFER
    }

    mapping(uint => State) states;

    mapping(bytes32 => uint) public dbTransferCount;
    mapping(bytes32 => bool) public dbTransfer;
    mapping(bytes32 => uint) public votesCount;
    mapping(bytes32 => bool) public votes;

    Status public status;

    uint public epoch;
    uint public nextEpoch;

    constructor(uint threshold, address[] memory validators, address _tokenContract) public {
        require(validators.length > 0);
        require(threshold < validators.length);

        tokenContract = IERC20(_tokenContract);

        epoch = 0;
        status = Status.KEYGEN;
        nextEpoch = 1;

        states[1] = State(validators, threshold, 0, 0);

        emit NewEpoch(0, 1);
    }

    IERC20 public tokenContract;

    modifier ready {
        require(status == Status.READY, "Not in ready state");
        _;
    }

    modifier readyOrVoting {
        require(status == Status.READY || status == Status.VOTING, "Not in ready or voting state");
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

    modifier currentValidator {
        require(getPartyId() != 0, "Not a current validator");
        _;
    }

    function exchange(uint value) public ready {
        require(value >= 10 ** 10);

        tokenContract.transferFrom(msg.sender, address(this), value);
        emit ExchangeRequest(value);
    }

    function transfer(bytes32 hash, address to, uint value) public readyOrVoting currentValidator {
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
            epoch = nextEpoch;
            emit EpochStart(epoch, states[epoch].x, states[epoch].y);
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

    function getX() view public returns (uint) {
        return states[epoch].x;
    }

    function getY() view public returns (uint) {
        return states[epoch].y;
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
        if (tryVote(Vote.START_VOTING)) {
            nextEpoch++;
            status = Status.VOTING;
            states[nextEpoch].threshold = states[epoch].threshold;
            states[nextEpoch].validators = states[epoch].validators;
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
                states[nextEpoch].validators[i] = states[nextEpoch].validators[getNextParties() - 1];
                break;
            }
        }
        delete states[nextEpoch].validators[getNextParties() - 1];
        states[nextEpoch].validators.length--;
    }

    function voteChangeThreshold(uint threshold) public voting currentValidator {
        if (tryVote(Vote.CHANGE_THRESHOLD, threshold)) {
            states[nextEpoch].threshold = threshold;
        }
    }

    function voteStartKeygen() public voting currentValidator {
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
        if (votesCount[vote] == getThreshold()) {
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
        if (votesCount[vote] == getNextThreshold()) {
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
