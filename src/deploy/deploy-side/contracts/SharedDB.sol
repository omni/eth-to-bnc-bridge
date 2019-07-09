pragma solidity ^0.5.0;

contract SharedDB {
    mapping(bytes32 => bytes) public db;
    mapping(bytes32 => uint) public signupsCount;
    mapping(bytes32 => uint) public dbSignups;

    function signupSign(bytes32 hash) public {
        require(dbSignups[keccak256(abi.encodePacked(msg.sender, hash))] == 0, "Already signuped");

        dbSignups[keccak256(abi.encodePacked(msg.sender, hash))] = ++signupsCount[hash];
    }

    function getSignupNumber(bytes32 hash, address[] memory validators, address validator) view public returns (uint) {
        require(dbSignups[keccak256(abi.encodePacked(validator, hash))] > 0, "Have not voted yet");
        uint id = 1;
        for (uint i = 0; i < validators.length; i++) {
            uint vid = dbSignups[keccak256(abi.encodePacked(validators[i], hash))];
            if (vid > 0 && vid < dbSignups[keccak256(abi.encodePacked(validator, hash))])
                id++;
        }
        return id;
    }

    function getSignupAddress(bytes32 hash, address[] memory validators, uint signupNumber) view public returns (address) {
        for (uint i = 0; i < validators.length; i++) {
            if (getSignupNumber(hash, validators, validators[i]) == signupNumber) {
                return validators[i];
            }
        }
        return address(0);
    }

    function setData(bytes32 hash, bytes32 key, bytes memory data) public {
        db[keccak256(abi.encodePacked(msg.sender, hash, key))] = data;
    }

    function getData(address from, bytes32 hash, bytes32 key) view public returns (bytes memory) {
        return db[keccak256(abi.encodePacked(from, hash, key))];
    }
}
