pragma solidity ^0.5.0;


contract MessageDecoder {
    // [0] - action type
    // [1..32] - epoch
    // [33..] - payload
    function _decodeNumber(bytes memory message) pure internal returns (uint a) {
        assembly {
            a := mload(add(message, 65))
        }
    }

    function _decodeBoolean(bytes memory message) pure internal returns (bool a) {
        assembly {
            a := and(mload(add(message, 34)), 1)
        }
    }

    function _decodeAddress(bytes memory message) pure internal returns (address a) {
        assembly {
            a := mload(add(message, 53))
        }
    }

    function _decodeKeygen(bytes memory message) pure internal returns (uint a, uint b) {
        assembly {
            a := mload(add(message, 65))
            b := mload(add(message, 97))
        }
    }

    function _decodeTransfer(bytes memory message) pure internal returns (address a, uint b) {
        assembly {
            a := mload(add(message, 85))
            b := mload(add(message, 117))
        }
    }
}
