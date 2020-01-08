pragma solidity ^0.5.0;

contract SignupStorage {
    uint public counter = 1;

    mapping(bytes32 => mapping(address => uint)) public signups;

    function signup(bytes32 hash) public {
        require(signups[hash][msg.sender] == 0, "Already signuped");

        signups[hash][msg.sender] = counter;
        counter++;
    }

    function isSignuped(bytes32 hash, address validator) public view returns (bool) {
        return signups[hash][validator] > 0;
    }

    function getSignupNumber(
        bytes32 hash,
        address[] memory validators,
        address validator
    ) public view returns (uint16) {
        if (signups[hash][validator] == 0)
            return 0;
        uint16 id = 1;
        for (uint i = 0; i < validators.length; i++) {
            uint vid = signups[hash][validators[i]];
            if (vid > 0 && vid < signups[hash][validator]) {
                id++;
            }
        }
        return id;
    }

    function getSignupAddress(
        bytes32 hash,
        address[] memory validators,
        uint16 signupNumber
    ) public view returns (address) {
        for (uint i = 0; i < validators.length; i++) {
            if (getSignupNumber(hash, validators, validators[i]) == signupNumber) {
                return validators[i];
            }
        }
        return address(0);
    }
}
