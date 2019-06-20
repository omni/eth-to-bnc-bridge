pragma solidity ^0.5.0;

contract SharedDB {
    uint32 threshold;
    uint32 parties;
    uint32 signupKeygenID;
    uint32 signupKeygenCurrent;
    uint32 signupSignID;
    uint32 signupSignCurrent;
    mapping(bytes32 => string) public db;

    event SignupKeygen(address indexed from, uint32 uuid, uint32 number);
    event SignupSign(address indexed from, uint32 uuid, uint32 number);

    constructor(uint32 _threshold, uint32 _parties) public {
        threshold = _threshold;
        parties = _parties;
        signupKeygenID = 1;
        signupSignID = 0x80000000;
    }

    function set(bytes32 key, string memory value) public {
        db[key] = value;
    }

    function signupKeygen() public {
        if (signupKeygenCurrent < parties) {
            signupKeygenCurrent++;
        }
        else {
            signupKeygenID++;
            signupKeygenCurrent = 1;
        }
        emit SignupKeygen(msg.sender, signupKeygenID, signupKeygenCurrent);
    }

    function signupSign() public {
        if (signupSignCurrent < threshold + 1) {
            signupSignCurrent++;
        }
        else {
            signupSignID++;
            signupSignCurrent = 1;
        }
        emit SignupSign(msg.sender, signupSignID, signupSignCurrent);
    }
}
