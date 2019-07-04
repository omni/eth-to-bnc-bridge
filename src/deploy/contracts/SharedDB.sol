pragma solidity ^0.5.0;
import './openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';

contract SharedDB {
    struct Validator {
        address addr;
        uint partyId;
        bytes32 next;
    }

    event NewEpoch(uint indexed epoch);
    event KeygenCompleted(uint indexed epoch, uint x, uint y);
    event Signup(address indexed from, bytes32 indexed hash, uint epoch, uint partyId);

    Validator validator;
    mapping(bytes32 => Validator) public dbValidator;
    mapping(bytes32 => bytes) public dbKeygen;
    mapping(bytes32 => uint) public confirmationsCount;
    mapping(bytes32 => bytes) public dbSign;
    mapping(bytes32 => uint) public signupsCount;
    mapping(bytes32 => bool) public confirmations;
    mapping(bytes32 => uint) public dbSignups;

    uint public x;
    uint public y;

    bool public ready;

    mapping(uint => uint) public threshold;
    mapping(uint => uint) public parties;

    uint public epoch;

    constructor(uint32 _threshold, uint32 _parties, address[] memory validators, address _tokenContract) public {
        require(_parties > 0);
        require(_threshold < _parties);
        require(validators.length == _parties);

        tokenContract = IERC20(_tokenContract);

        epoch = 1;
        ready = false;

        threshold[epoch] = _threshold;
        parties[epoch] = _parties;
        // First validator
        validator = Validator(validators[0], 1, 0);
        setValidator(validators[0], validator);

        // Other validators
        for (uint i = 1; i < _parties; i++) {
            setValidator(validators[i], Validator(validators[i], i + 1, 0));
            // Link to prev one
            Validator storage v = getValidator(validators[i - 1]);
            v.next = keccak256(abi.encodePacked(epoch, validators[i]));
        }

        emit NewEpoch(epoch);
    }

    IERC20 public tokenContract;

    event ReceivedTokens(address from, string recipient, uint value);

    function requestAffirmation(uint value, string memory recipient) public {
        tokenContract.transferFrom(msg.sender, address(this), value);

        emit ReceivedTokens(msg.sender, recipient, value);
    }

    function confirm(uint _x, uint _y) public {
        Validator storage v = getValidator(msg.sender);
        require(v.partyId != 0);
        require(!confirmations[keccak256(abi.encodePacked(epoch, v.partyId, _x, _y))]);

        confirmations[keccak256(abi.encodePacked(epoch, v.partyId, _x, _y))] = true;
        if (++confirmationsCount[keccak256(abi.encodePacked(epoch, _x, _y))] == parties[epoch]) {
            x = _x;
            y = _y;
            ready = true;
            emit KeygenCompleted(epoch, x, y);
        }
    }

    function setKeygenData(bytes32 key, bytes memory data) public {
        Validator storage v = getValidator(msg.sender);
        require(v.partyId != 0);
        require(!ready);

        dbKeygen[keccak256(abi.encodePacked(epoch, key, v.partyId))] = data;
    }

    function getKeygenData(uint fromPartyId, bytes32 key) view public returns (bytes memory) {
        return dbKeygen[keccak256(abi.encodePacked(epoch, key, fromPartyId))];
    }

    function signupSign(bytes32 hash) public {
        signupSign(hash, epoch);
    }

    function signupSign(bytes32 hash, uint _epoch) public {
        Validator storage v = getValidator(msg.sender, _epoch);
        require(v.partyId != 0);
        require(ready);
        require(signupsCount[keccak256(abi.encodePacked(_epoch, hash))] <= threshold[_epoch], "Already enough signers");
        //require(confirmationsCount[keccak256(abi.encodePacked(_epoch, x, y))] == parties[_epoch]); == ready

        dbSignups[keccak256(abi.encodePacked(_epoch, hash, v.partyId))] = ++signupsCount[keccak256(abi.encodePacked(_epoch, hash))];

        emit Signup(msg.sender, hash, _epoch, signupsCount[keccak256(abi.encodePacked(_epoch, hash))]);
    }

    function setSignData(bytes32 hash, bytes32 key, bytes memory data) public {
        Validator storage v = getValidator(msg.sender);
        require(v.partyId != 0);
        require(ready);
        uint signupId = dbSignups[keccak256(abi.encodePacked(epoch, hash, v.partyId))];
        require(signupId != 0);

        dbSign[keccak256(abi.encodePacked(epoch, hash, signupId, key))] = data;
    }

    function getSignData(uint signupId, bytes32 hash, bytes32 key) view public returns (bytes memory) {
        //uint id = dbSignups[keccak256(abi.encodePacked(epoch, hash, fromPartyId))];
        return dbSign[keccak256(abi.encodePacked(epoch, hash, signupId, key))];
    }

    function setValidator(address a, Validator memory v) private {
        dbValidator[keccak256(abi.encodePacked(epoch, a))] = v;
    }

    function getValidator(address a) view private returns (Validator storage) {
        return getValidator(a, epoch);
    }

    function getValidator(address a, uint kv) view private returns (Validator storage) {
        return dbValidator[keccak256(abi.encodePacked(kv, a))];
    }

    function getPartyId() view public returns (uint) {
        return getValidator(msg.sender).partyId;
    }
}
