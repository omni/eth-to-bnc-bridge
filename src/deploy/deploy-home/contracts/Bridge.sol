pragma solidity ^0.5.0;

import './openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';

contract Bridge {
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

    mapping(uint => State) states;

    mapping(bytes32 => uint) public confirmationsCount;
    mapping(bytes32 => bool) public confirmations;
    mapping(bytes32 => uint) public dbTransferCount;
    mapping(bytes32 => bool) public dbTransfer;
    mapping(bytes32 => uint) public votesCount;
    mapping(bytes32 => bool) public votes;

    // 0 - ready
    // 1 - voting for changing in next epoch, but still ready
    // 2 - keygen, can be cancelled
    // 3 - funds transfer, cannot be cancelled
    uint public status;

    uint public epoch;
    uint public nextEpoch;

    constructor(uint threshold, address[] memory validators, address _tokenContract) public {
        require(validators.length > 0);
        require(threshold < validators.length);

        tokenContract = IERC20(_tokenContract);

        epoch = 0;
        status = 2;
        nextEpoch = 1;

        states[1] = State(validators, threshold, 0, 0);

        emit NewEpoch(0, 1);
    }

    IERC20 public tokenContract;

    modifier ready {
        require(status == 0, "Not in ready state");
        _;
    }

    modifier readyOrVoting {
        require(status < 2, "Not in ready or voting state");
        _;
    }

    modifier voting {
        require(status == 1, "Not in voting state");
        _;
    }

    modifier keygen {
        require(status == 2, "Not in keygen state");
        _;
    }

    modifier fundsTransfer {
        require(status == 3, "Not in funds transfer state");
        _;
    }

    modifier currentValidator {
        require(getPartyId() != 0, "Not a current validator");
        _;
    }

    function transfer(bytes32 hash, address to, uint value) public readyOrVoting currentValidator {
        require(!dbTransfer[keccak256(abi.encodePacked(hash, msg.sender, to, value))], "Already voted");

        dbTransfer[keccak256(abi.encodePacked(hash, msg.sender, to, value))] = true;
        if (++dbTransferCount[keccak256(abi.encodePacked(hash, to, value))] == getThreshold() + 1) {
            dbTransferCount[keccak256(abi.encodePacked(hash, to, value))] = 2 ** 255;
            tokenContract.transfer(to, value);
        }
    }

    function confirmKeygen(uint x, uint y) public keygen {
        require(getNextPartyId(msg.sender) != 0, "Not a next validator");
        require(!confirmations[keccak256(abi.encodePacked(uint(1), nextEpoch, msg.sender, x, y))], "Already confirmed");

        confirmations[keccak256(abi.encodePacked(uint(1), nextEpoch, msg.sender, x, y))] = true;
        if (++confirmationsCount[keccak256(abi.encodePacked(uint(1), nextEpoch, x, y))] == getNextThreshold() + 1) {
            confirmationsCount[keccak256(abi.encodePacked(uint(1), nextEpoch, x, y))] = 2 ** 255;
            states[nextEpoch].x = x;
            states[nextEpoch].y = y;
            if (nextEpoch == 1) {
                status = 0;
                epoch = nextEpoch;
                emit EpochStart(epoch, x, y);
            }
            else {
                status = 3;
                emit NewFundsTransfer(epoch, nextEpoch);
            }
        }
    }

    function confirmFundsTransfer() public fundsTransfer currentValidator {
        require(epoch > 0, "First epoch does not need funds transfer");
        require(!confirmations[keccak256(abi.encodePacked(uint(2), nextEpoch, msg.sender))], "Already confirmed");

        confirmations[keccak256(abi.encodePacked(uint(2), nextEpoch, msg.sender))] = true;
        if (++confirmationsCount[keccak256(abi.encodePacked(uint(2), nextEpoch))] == getNextThreshold() + 1) {
            confirmationsCount[keccak256(abi.encodePacked(uint(2), nextEpoch))] = 2 ** 255;
            status = 0;
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
        require(!votes[keccak256(abi.encodePacked(uint(6), nextEpoch, msg.sender))], "Already voted");

        votes[keccak256(abi.encodePacked(uint(6), nextEpoch, msg.sender))] = true;
        if (++votesCount[keccak256(abi.encodePacked(uint(6), nextEpoch))] == getThreshold() + 1) {
            nextEpoch++;
            status = 1;
            states[nextEpoch].threshold = states[epoch].threshold;
            states[nextEpoch].validators = states[epoch].validators;
        }
    }

    function voteAddValidator(address validator) public voting currentValidator {
        require(getNextPartyId(validator) == 0, "Already a validator");
        require(!votes[keccak256(abi.encodePacked(uint(1), nextEpoch, msg.sender, validator))], "Already voted");

        votes[keccak256(abi.encodePacked(uint(1), nextEpoch, msg.sender, validator))] = true;
        if (++votesCount[keccak256(abi.encodePacked(uint(1), nextEpoch, validator))] == getThreshold() + 1) {
            states[nextEpoch].validators.push(validator);
        }
    }

    function voteRemoveValidator(address validator) public voting currentValidator {
        require(getNextPartyId(validator) != 0, "Already not a validator");
        require(!votes[keccak256(abi.encodePacked(uint(2), nextEpoch, msg.sender, validator))], "Already voted");

        votes[keccak256(abi.encodePacked(uint(2), nextEpoch, msg.sender, validator))] = true;
        if (++votesCount[keccak256(abi.encodePacked(uint(2), nextEpoch, validator))] == getThreshold() + 1) {
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
        require(!votes[keccak256(abi.encodePacked(uint(3), nextEpoch, msg.sender, threshold))], "Already voted");

        votes[keccak256(abi.encodePacked(uint(3), nextEpoch, msg.sender, threshold))] = true;
        if (++votesCount[keccak256(abi.encodePacked(uint(3), nextEpoch, threshold))] == getThreshold() + 1) {
            states[nextEpoch].threshold = threshold;
        }
    }

    function voteStartKeygen() public voting currentValidator {
        require(!votes[keccak256(abi.encodePacked(uint(4), nextEpoch + 1, msg.sender))], "Voted already");

        votes[keccak256(abi.encodePacked(uint(4), nextEpoch + 1, msg.sender))] = true;
        if (++votesCount[keccak256(abi.encodePacked(uint(4), nextEpoch + 1))] == getThreshold() + 1) {
            status = 2;

            emit NewEpoch(epoch, nextEpoch);
        }
    }

    function voteCancelKeygen() public keygen currentValidator {
        require(!votes[keccak256(abi.encodePacked(uint(5), nextEpoch, msg.sender))], "Voted already");

        votes[keccak256(abi.encodePacked(uint(5), nextEpoch, msg.sender))] = true;
        if (++votesCount[keccak256(abi.encodePacked(uint(5), nextEpoch))] == getThreshold() + 1) {
            status = 0;

            emit NewEpochCancelled(nextEpoch);
        }
    }
}
