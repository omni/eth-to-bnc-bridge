pragma solidity ^0.5.0;

contract SignedMessageStorage {
    event NewMessage(bytes32 msgHash);
    event NewSignature(address indexed signer, bytes32 msgHash);

    uint public counter = 1;

    struct SignedMessage {
        bytes message;
        mapping(address => bytes) signatures;
        mapping(address => uint) sigOrder;
    }

    mapping(bytes32 => SignedMessage) public signedMessages;

    function addSignature(bytes memory message, bytes memory rsv) public {
        require(rsv.length == 65, "Incorrect signature length");

        bytes32 msgHash = hashMessage(message);

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(rsv, 32))
            s := mload(add(rsv, 64))
            v := byte(0, mload(add(rsv, 96)))
        }

        require(ecrecover(msgHash, v, r, s) == msg.sender);

        if (signedMessages[msgHash].message.length == 0) {
            signedMessages[msgHash].message = message;

            emit NewMessage(msgHash);
        }

        if (signedMessages[msgHash].signatures[msg.sender].length == 0) {
            signedMessages[msgHash].signatures[msg.sender] = rsv;
            signedMessages[msgHash].sigOrder[msg.sender] = counter;
            counter++;

            emit NewSignature(msg.sender, msgHash);
        }
    }

    function getSignatures(bytes32 msgHash, address[] memory validators) public view returns (bytes memory) {
        bytes memory result;
        for (uint i = 0; i < validators.length; i++) {
            result = abi.encodePacked(result, signedMessages[msgHash].signatures[validators[i]]);
        }
        return result;
    }

    function isResponsibleToSend(
        bytes32 msgHash,
        address[] memory validators,
        uint16 threshold,
        address validatorAddress
    ) public view returns (bool) {
        uint senderPartyId = uint(msgHash) % threshold;
        SignedMessage storage message = signedMessages[msgHash];
        uint mySigOrder = message.sigOrder[validatorAddress];
        if (mySigOrder == 0)
            return false;

        uint16 id = 0;
        for (uint i = 0; i < validators.length; i++) {
            uint vid = message.sigOrder[validators[i]];
            if (vid > 0 && vid < mySigOrder) {
                id++;
            }
        }
        return id == senderPartyId;
    }

    function hashMessage(bytes memory message) internal pure returns(bytes32) {
        if (message.length == 3) {
            return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n3", message));
        }
        if (message.length == 23) {
            return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n23", message));
        }
        if (message.length == 32) {
            return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
        }
        if (message.length == 67) {
            return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n67", message));
        }
        revert("Incorrect message length");
    }
}
