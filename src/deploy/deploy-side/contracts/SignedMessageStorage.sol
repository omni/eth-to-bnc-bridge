pragma solidity ^0.5.0;

contract SignedMessageStorage {
    event NewMessage(bytes32 msgHash);

    struct SignedMessage {
        bytes message;
        mapping(address => bytes) signatures;
    }

    mapping(bytes32 => SignedMessage) public signedMessages;

    function addSignature(bytes memory message, bytes memory rsv) public {
        require(message.length > 0, "Incorrect message length");
        require(rsv.length == 65, "Incorrect signature length");

        bytes32 msgHash;
        if (message.length == 3) {
            msgHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n3", message));
        } else if (message.length == 32) {
            msgHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
        } else if (message.length == 67) {
            msgHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n67", message));
        } else {
            revert("Incorrect message length");
        }

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
        signedMessages[msgHash].signatures[msg.sender] = rsv;
    }

    function getSignatures(bytes32 msgHash, address[] memory validators) public view returns (bytes memory) {
        bytes memory result;
        for (uint i = 0; i < validators.length; i++) {
            result = abi.encodePacked(result, signedMessages[msgHash].signatures[validators[i]]);
        }
        return result;
    }

}
