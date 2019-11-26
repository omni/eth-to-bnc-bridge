pragma solidity ^0.5.0;

import "./Government.sol";
import "./MessageDecoder.sol";

contract MessageHandler is Government, MessageDecoder {
    uint constant SIGNATURE_SIZE = 65;

    mapping(bytes32 => bool) public handledMessages;

    function applyMessage(bytes memory message, bytes memory signatures) public {
        (bytes32 msgHash, uint16 msgEpoch) = checkSignedMessage(message, signatures);
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
            // [3,34] - x, [35,66] - y
            require(message.length == 67, "Incorrect message length");
            (uint x, uint y) = _decodeKeygen(message);
            _confirmKeygen(x, y);
        } else if (msgAction == Action.CONFIRM_FUNDS_TRANSFER) {
            require(message.length == 3, "Incorrect message length");
            _confirmFundsTransfer();
        } else if (msgAction == Action.CONFIRM_CLOSE_EPOCH) {
            require(message.length == 3, "Incorrect message length");
            _confirmCloseEpoch();
        } else if (msgAction == Action.VOTE_START_VOTING) {
            require(message.length == 3, "Incorrect message length");
            _startVoting();
        } else if (msgAction == Action.VOTE_ADD_VALIDATOR) {
            // [3,22] - address, [23,31] - extra data
            require(message.length == 32, "Incorrect message length");
            address validator = _decodeAddress(message);
            _addValidator(validator);
        } else if (msgAction == Action.VOTE_REMOVE_VALIDATOR) {
            // [3,22] - address, [23,31] - extra data
            require(message.length == 32, "Incorrect message length");
            address validator = _decodeAddress(message);
            _removeValidator(validator);
        } else if (msgAction == Action.VOTE_CHANGE_THRESHOLD) {
            // [3,4] - threshold, [5,31] - extra data
            require(message.length == 32, "Incorrect message length");
            uint16 threshold = _decodeUint16(message);
            _changeThreshold(threshold);
        } else if (msgAction == Action.VOTE_CHANGE_RANGE_SIZE) {
            // [3,4] - rangeSize, [5,31] - extra data
            require(message.length == 32, "Incorrect message length");
            uint16 rangeSize = _decodeUint16(message);
            _changeRangeSize(rangeSize);
        } else if (msgAction == Action.VOTE_CHANGE_CLOSE_EPOCH) {
            // [3] - closeEpoch, [4,31] - extra data
            require(message.length == 32, "Incorrect message length");
            bool closeEpoch = _decodeBoolean(message);
            _changeCloseEpoch(closeEpoch);
        } else if (msgAction == Action.VOTE_START_KEYGEN) {
            require(message.length == 3, "Incorrect message length");
            _startKeygen();
        } else if (msgAction == Action.VOTE_CANCEL_KEYGEN) {
            require(message.length == 3, "Incorrect message length");
            _cancelKeygen();
        } else if (msgAction == Action.TRANSFER) {
            // [3,34] - txHash, [35,54] - address, [55,66] - value
            require(message.length == 67, "Incorrect message length");
            (address to, uint96 value) = _decodeTransfer(message);
            _transfer(to, value);
        } else {
            revert("Unknown message action");
        }
    }

    function checkSignedMessage(bytes memory message, bytes memory signatures) view public returns (bytes32, uint16) {
        require(signatures.length % SIGNATURE_SIZE == 0, "Incorrect signatures length");

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
        require(!handledMessages[msgHash], "Tx was already handled");

        uint16 msgEpoch;
        assembly {
            msgEpoch := mload(add(message, 3))
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
