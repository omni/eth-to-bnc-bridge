pragma solidity ^0.5.0;

library MessageHash {
    function _hash(bytes memory message) internal pure returns (bytes32 a) {
        if (message.length == 3) {
            return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n3", message));
        }
        if (message.length == 23) {
            return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n23", message));
        }
        if (message.length == 32) {
            return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
        }
        if (message.length == 65) {
            return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n65", message));
        }
        revert("Incorrect message length");
    }
}
