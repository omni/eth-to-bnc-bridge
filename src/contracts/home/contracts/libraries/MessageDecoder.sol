pragma solidity ^0.5.0;


library MessageDecoder {
    // [0] - action type
    // [1,2] - epoch
    // [3..] - payload
    function _decodeUint16(bytes memory message) internal pure returns (uint16 a) {
        assembly {
            a := mload(add(message, 5))
        }
    }

    function _decodeBoolean(bytes memory message) internal pure returns (bool a) {
        assembly {
            a := and(mload(add(message, 4)), 1)
        }
    }

    function _decodeAddress(bytes memory message) internal pure returns (address a) {
        assembly {
            a := mload(add(message, 23))
        }
    }

    function _decodeKeygen(bytes memory message) internal pure returns (uint a, uint b) {
        assembly {
            a := mload(add(message, 35))
            b := mload(add(message, 67))
        }
    }

    function _decodeTransfer(bytes memory message) internal pure returns (address a, uint96 b) {
        assembly {
            a := mload(add(message, 55))
            b := mload(add(message, 67))
        }
    }
}
