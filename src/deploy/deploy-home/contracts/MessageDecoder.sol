pragma solidity ^0.5.0;


contract MessageDecoder {
    // [0] - action type
    // [1,2] - epoch
    // [3..] - payload
    function _decodeUint16(bytes memory message) pure internal returns (uint16 a) {
        assembly {
            a := mload(add(message, 5))
        }
    }

    function _decodeBoolean(bytes memory message) pure internal returns (bool a) {
        assembly {
            a := and(mload(add(message, 4)), 1)
        }
    }

    function _decodeAddress(bytes memory message) pure internal returns (address a) {
        assembly {
            a := mload(add(message, 23))
        }
    }

    function _decodeKeygen(bytes memory message) pure internal returns (uint a, uint b) {
        assembly {
            a := mload(add(message, 35))
            b := mload(add(message, 67))
        }
    }

    function _decodeTransfer(bytes memory message) pure internal returns (address a, uint96 b) {
        assembly {
            a := mload(add(message, 55))
            b := mload(add(message, 67))
        }
    }
}
