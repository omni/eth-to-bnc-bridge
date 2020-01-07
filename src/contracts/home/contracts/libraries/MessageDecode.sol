pragma solidity ^0.5.0;

library MessageDecode {
    // [0] - action type
    // [1,2] - epoch
    // [3..] - payload
    function _decodeUint16(bytes memory message) internal pure returns (uint16 a) {
        assembly {
            a := mload(add(message, 5))
        }
    }

    function _decodeUint96(bytes memory message) internal pure returns (uint96 a) {
        assembly {
            a := mload(add(message, 15))
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

    function _decodeTransfer(bytes memory message) internal pure returns (address a, uint96 b) {
        assembly {
            a := mload(add(message, 55))
            b := mload(add(message, 67))
        }
    }
}
