pragma solidity ^0.5.0;

import "./Government.sol";
import "./MessageDecoder.sol";

contract MessageHandler is Government, MessageDecoder {
    uint constant SIGNATURE_SIZE = 65;

    mapping(bytes32 => bool) public handledMessages;

    function applyMessage(bytes memory message, bytes memory signatures) public {
        (bytes32 msgHash, uint msgEpoch) = checkSignedMessage(message, signatures);
        handledMessages[msgHash] = true;

        Action msgAction = Action(uint8(message[0]));

        if (msgAction == Action.CONFIRM_KEYGEN || msgAction == Action.VOTE_CANCEL_KEYGEN) {
            require(msgEpoch == nextEpoch, "Incorrect message epoch");
        } else if (msgAction == Action.TRANSFER) {
            require(msgEpoch <= epoch, "Incorrect message epoch");
        } else {
            require(msgEpoch == epoch, "Incorrect message epoch");
        }

        if (msgAction == Action.CONFIRM_KEYGEN) {
            require(message.length == 97, "Incorrect message length");
            (uint x, uint y) = _decodeKeygen(message);
            _confirmKeygen(x, y);
        } else if (msgAction == Action.CONFIRM_FUNDS_TRANSFER) {
            require(message.length == 33, "Incorrect message length");
            _confirmFundsTransfer();
        } else if (msgAction == Action.CONFIRM_CLOSE_EPOCH) {
            require(message.length == 33, "Incorrect message length");
            _confirmCloseEpoch();
        } else if (msgAction == Action.VOTE_START_VOTING) {
            require(message.length == 33, "Incorrect message length");
            _startVoting();
        } else if (msgAction == Action.VOTE_ADD_VALIDATOR) {
            require(message.length == 53, "Incorrect message length");
            address validator = _decodeAddress(message);
            _addValidator(validator);
        } else if (msgAction == Action.VOTE_REMOVE_VALIDATOR) {
            require(message.length == 53, "Incorrect message length");
            address validator = _decodeAddress(message);
            _removeValidator(validator);
        } else if (msgAction == Action.VOTE_CHANGE_THRESHOLD) {
            require(message.length == 65, "Incorrect message length");
            uint threshold = _decodeNumber(message);
            _changeThreshold(threshold);
        } else if (msgAction == Action.VOTE_CHANGE_RANGE_SIZE) {
            require(message.length == 65, "Incorrect message length");
            uint rangeSize = _decodeNumber(message);
            _changeRangeSize(rangeSize);
        } else if (msgAction == Action.VOTE_CHANGE_CLOSE_EPOCH) {
            require(message.length == 34, "Incorrect message length");
            bool closeEpoch = _decodeBoolean(message);
            _changeCloseEpoch(closeEpoch);
        } else if (msgAction == Action.VOTE_START_KEYGEN) {
            require(message.length == 33, "Incorrect message length");
            _startKeygen();
        } else if (msgAction == Action.VOTE_CANCEL_KEYGEN) {
            require(message.length == 33, "Incorrect message length");
            _cancelKeygen();
        } else if (msgAction == Action.TRANSFER) {
            require(message.length == 117, "Incorrect message length");
            (address to, uint value) = _decodeTransfer(message);
            _transfer(to, value);
            // 0b
            // 0000000000000000000000000000000000000000000000000000000000000001
            // 73824c9dc9318568f803a7fd6a147d67f0c1c328f0ed955456ed7357e6b470f8
            // ad6c8127143032d843a260c5d379d8d9b3d51f15
            // 0000000000000000000000000000000000000000000000004563918244f40000
        } else {
            revert("Unknown message action");
        }
    }

    function checkSignedMessage(bytes memory message, bytes memory signatures) view public returns (bytes32, uint) {
        require(signatures.length % SIGNATURE_SIZE == 0, "Incorrect signatures length");

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
        require(!handledMessages[msgHash], "Tx was already handled");

        uint msgEpoch;
        assembly {
            msgEpoch := mload(add(message, 33))
        }
        require(msgEpoch <= nextEpoch, "Invalid epoch number");

        uint signaturesNum = signatures.length / SIGNATURE_SIZE;
        require(signaturesNum >= getThreshold(msgEpoch), "Not enough signatures");

        address[] memory possibleValidators = getValidators(msgEpoch);

        bytes32 r;
        bytes32 s;
        uint8 v;

        for (uint i = 0; i < signaturesNum; i++) {
            uint offset = i * SIGNATURE_SIZE;

            assembly {
                r := mload(add(add(signatures, 32), offset))
                s := mload(add(add(signatures, 64), offset))
                v := byte(0, mload(add(add(signatures, 96), offset)))
            }

            address signer = ecrecover(msgHash, v, r, s);
            uint j;
            for (j = 0; j < possibleValidators.length; j++) {
                if (possibleValidators[j] == signer) {
                    delete possibleValidators[j];
                    break;
                }
            }
            require(j != possibleValidators.length, "Not a validator signature");
        }
        return (msgHash, msgEpoch);
    }
}
