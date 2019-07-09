pragma solidity ^0.5.0;

import './openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';

contract Bridge {
    event NewEpoch(uint indexed epoch);
    event KeygenCompleted(uint indexed epoch, uint x, uint y);
    event ReceivedTokens(address from, string recipient, uint value); // pass epoch and params in this event

    address[] public validators;
    address[] public nextValidators;
    address[] public savedNextValidators;
    mapping(bytes32 => uint) public confirmationsCount;
    mapping(bytes32 => bool) public confirmations;
    mapping(bytes32 => uint) public dbTransferCount;
    mapping(bytes32 => bool) public dbTransfer;
    mapping(bytes32 => uint) public votesCount;
    mapping(bytes32 => bool) public votes;

    uint public x;
    uint public y;

    bool public ready;

    uint public threshold;
    uint public nextThreshold;

    uint public epoch;
    uint public nextEpoch;

    constructor(uint _threshold, uint _parties, address[] memory _validators, address _tokenContract) public {
        require(_parties > 0);
        require(_threshold < _parties);
        require(_validators.length == _parties);

        tokenContract = IERC20(_tokenContract);

        epoch = 0;
        nextEpoch = 1;
        ready = false;

        nextThreshold = _threshold;
        savedNextValidators = _validators;

        emit NewEpoch(nextEpoch);
    }

    IERC20 public tokenContract;

    function requestAffirmation(uint value, string memory recipient) public {
        require(ready, "Current epoch is not ready");

        tokenContract.transferFrom(msg.sender, address(this), value);

        emit ReceivedTokens(msg.sender, recipient, value);
    }

    function transfer(bytes32 hash, address to, uint value) public {
        uint partyId = getPartyId();
        require(partyId != 0, "Not a validator");
        require(!dbTransfer[keccak256(abi.encodePacked(hash, msg.sender, to, value))], "Already voted");

        dbTransfer[keccak256(abi.encodePacked(hash, msg.sender, to, value))] = true;
        if (++dbTransferCount[keccak256(abi.encodePacked(hash, to, value))] == threshold + 1)
            tokenContract.transfer(to, value);
    }

    function confirm(uint _x, uint _y) public {
        uint partyId = getNextPartyId(msg.sender);
        require(partyId != 0, "Not a next validator");
        require(!confirmations[keccak256(abi.encodePacked(nextEpoch, partyId, _x, _y))], "Already confirmed");

        confirmations[keccak256(abi.encodePacked(nextEpoch, partyId, _x, _y))] = true;
        if (++confirmationsCount[keccak256(abi.encodePacked(nextEpoch, _x, _y))] == nextParties()) {
            confirmationsCount[keccak256(abi.encodePacked(nextEpoch, _x, _y))] = 2 ** 256 - 1;
            x = _x;
            y = _y;
            validators = savedNextValidators;
            nextValidators = savedNextValidators;
            threshold = nextThreshold;
            epoch = nextEpoch;
            ready = true;
            emit KeygenCompleted(epoch, x, y);
        }
    }

    function parties() view public returns (uint) {
        return validators.length;
    }

    function nextParties() view public returns (uint) {
        return savedNextValidators.length;
    }

    function getPartyId() view public returns (uint) {
        return getPartyId(msg.sender);
    }

    function getPartyId(address a) view public returns (uint) {
        for (uint i = 0; i < parties(); i++) {
            if (validators[i] == a)
                return i + 1;
        }
        return 0;
    }

    function getNextPartyId(address a) view public returns (uint) {
        for (uint i = 0; i < nextParties(); i++) {
            if (savedNextValidators[i] == a)
                return i + 1;
        }
        return 0;
    }

    function getValidatorsArray() view public returns (address[] memory) {
        return validators;
    }

    function getNextValidatorsArray() view public returns (address[] memory) {
        return savedNextValidators;
    }

    function voteAddValidator(address validator) public {
        require(getPartyId() != 0, "Not a current validator");
        require(getNextPartyId(validator) == 0, "Already a validator");
        require(!votes[keccak256(abi.encodePacked(uint(1), epoch, msg.sender, validator))], "Already voted");

        votes[keccak256(abi.encodePacked(uint(1), epoch, msg.sender, validator))] = true;
        if (++votesCount[keccak256(abi.encodePacked(uint(1), epoch, validator))] == threshold + 1) {
            nextValidators.push(validator);
        }
    }

    function voteRemoveValidator(address validator) public {
        require(getPartyId() != 0, "Not a current validator");
        require(getNextPartyId(validator) != 0, "Already not a validator");
        require(!votes[keccak256(abi.encodePacked(uint(2), epoch, msg.sender, validator))], "Already voted");

        votes[keccak256(abi.encodePacked(uint(2), epoch, msg.sender, validator))] = true;
        if (++votesCount[keccak256(abi.encodePacked(uint(2), epoch, validator))] == threshold + 1) {
            _removeValidator(validator);
        }
    }

    function _removeValidator(address validator) private {
        for (uint i = 0; i < nextValidators.length - 1; i++) {
            if (nextValidators[i] == validator) {
                nextValidators[i] = nextValidators[nextValidators.length - 1];
            }
        }
        delete nextValidators[nextValidators.length - 1];
        nextValidators.length--;
    }

    function voteChangeThreshold(uint _threshold) public {
        require(getPartyId() != 0, "Not a current validator");
        require(!votes[keccak256(abi.encodePacked(uint(3), epoch, msg.sender, threshold))], "Already voted");

        votes[keccak256(abi.encodePacked(uint(3), epoch, msg.sender, _threshold))] = true;
        if (++votesCount[keccak256(abi.encodePacked(uint(3), epoch, _threshold))] == threshold + 1) {
            nextThreshold = _threshold;
        }
    }

    function voteStartEpoch(uint newEpoch) public {
        require(newEpoch == nextEpoch + 1, "Wrong epoch number");
        require(getPartyId() != 0, "Not a current validator");
        require(!votes[keccak256(abi.encodePacked(uint(4), newEpoch, msg.sender))], "Voted already");

        votes[keccak256(abi.encodePacked(uint(4), newEpoch, msg.sender))] = true;
        if (++votesCount[keccak256(abi.encodePacked(uint(4), newEpoch))] == threshold + 1) {
            ready = false;

            nextEpoch = newEpoch;
            savedNextValidators = nextValidators;
            emit NewEpoch(newEpoch);
        }
    }
}
