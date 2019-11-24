pragma solidity ^0.5.0;

contract SignedMessageStorage {
    event NewMessage(bytes32 msgHash);

    struct SignedMessage {
        bytes message;
        mapping(address => bytes) signatures;
    }

    mapping(bytes32 => SignedMessage) public signedMessages;
    // 0xc17c720a
    // 0000000000000000000000000000000000000000000000000000000000000040
    // 00000000000000000000000000000000000000000000000000000000000000e0
    // 0000000000000000000000000000000000000000000000000000000000000061
    // 00
    // 0000000000000000000000000000000000000000000000000000000000000001
    // 7681bd587db2576708db7085c2704c84e19db65f5b8a90897866c411a4002f86
    // 6c66695a8595b4b41f779877b2a177c79969bfd627bd691bcd14f27eaab7ad3c
    // 00000000000000000000000000000000000000000000000000000000000000
    // 0000000000000000000000000000000000000000000000000000000000000041
    // 82b4f5c4211ca2c5a0a5ec8d5476da5d537e282b852108bcfb006058b942d6a1
    // 51ca56bfe41529215fe1f6b8a56b69ecb1357d588bfb38a9f7bd858df82d8038
    // 1c00000000000000000000000000000000000000000000000000000000000000
    function addSignature(bytes memory message, bytes memory rsv) public {
        require(message.length > 0, "Incorrect message length");
        require(rsv.length == 65, "Incorrect signature length");

        bytes32 msgHash;
        if (message.length == 33) {
            msgHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n33", message));
        } else if (message.length == 34) {
            msgHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n34", message));
        } else if (message.length == 53) {
            msgHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n53", message));
        } else if (message.length == 65) {
            msgHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n65", message));
        } else if (message.length == 97) {
            msgHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n97", message));
        } else if (message.length == 117) {
            msgHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n117", message));
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
