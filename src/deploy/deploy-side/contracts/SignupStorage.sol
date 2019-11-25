pragma solidity ^0.5.0;

contract SignupStorage {
    mapping(bytes32 => uint16) public signupsCount;
    mapping(bytes32 => mapping(address => uint16)) public signups;

    function signup(bytes32 hash) public {
        require(signups[hash][msg.sender] == 0, "Already signuped");

        signups[hash][msg.sender] = ++signupsCount[hash];
    }

    function getSignupNumber(
        bytes32 hash,
        address[] memory validators,
        address validator
    ) view public returns (uint16) {
        if (signups[hash][validator] == 0)
            return 0;
        uint16 id = 1;
        for (uint i = 0; i < validators.length; i++) {
            uint16 vid = signups[hash][validators[i]];
            if (vid > 0 && vid < signups[hash][validator])
                id++;
        }
        return id;
    }

    function getSignupAddress(
        bytes32 hash,
        address[] memory validators,
        uint16 signupNumber
    ) view public returns (address) {
        for (uint i = 0; i < validators.length; i++) {
            if (getSignupNumber(hash, validators, validators[i]) == signupNumber) {
                return validators[i];
            }
        }
        return address(0);
    }
}
