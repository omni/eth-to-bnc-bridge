pragma solidity ^0.5.0;

contract SignupStorage {
    struct SignupsCounter {
        uint16 count;
        mapping(address => uint16) id;
    }
    mapping(bytes32 => SignupsCounter) public signups;

    function signup(bytes32 hash) public {
        require(signups[hash].id[msg.sender] == 0, "Already signuped");

        signups[hash].id[msg.sender] = ++signups[hash].count;
    }

    function isSignuped(bytes32 hash) public view returns (bool) {
        return isSignuped(hash, msg.sender);
    }

    function isSignuped(bytes32 hash, address validator) public view returns (bool) {
        return signups[hash].id[validator] > 0;
    }

    function getSignupNumber(
        bytes32 hash,
        address[] memory validators,
        address validator
    ) view public returns (uint16) {
        if (signups[hash].id[validator] == 0)
            return 0;
        uint16 id = 1;
        for (uint i = 0; i < validators.length; i++) {
            uint16 vid = signups[hash].id[validators[i]];
            if (vid > 0 && vid < signups[hash].id[validator])
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
