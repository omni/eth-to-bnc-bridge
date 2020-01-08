pragma solidity ^0.5.0;

import "./BridgeTransitions.sol";
import "./libraries/MessageDecode.sol";
import "./libraries/MessageHash.sol";

contract BridgeMessageProcessor is BridgeTransitions {
    using MessageDecode for bytes;
    using MessageHash for bytes;

    uint internal constant SIGNATURE_SIZE = 65;

    enum Action {
        CONFIRM_KEYGEN,
        CONFIRM_FUNDS_TRANSFER,
        CONFIRM_CLOSE_EPOCH,
        START_VOTING,
        ADD_VALIDATOR,
        REMOVE_VALIDATOR,
        CHANGE_THRESHOLD,
        CHANGE_CLOSE_EPOCH,
        START_KEYGEN,
        CANCEL_KEYGEN,
        TRANSFER,
        CHANGE_MIN_PER_TX_LIMIT,
        CHANGE_MAX_PER_TX_LIMIT,
        INCREASE_EXECUTION_MAX_TX_LIMIT,
        DECREASE_EXECUTION_MIN_TX_LIMIT,
        CHANGE_RANGE_SIZE
    }

    event AppliedMessage(bytes message);
    event RescheduleTransferMessage(bytes32 msgHash);

    mapping(bytes32 => bool) public handledMessages;

    function applyMessage(bytes memory message, bytes memory signatures) public {
        Action msgAction = Action(uint8(message[0]));
        uint16 msgEpoch;
        bytes32 msgHash = message._hash();

        // In case of transfer action, it is possible that a new epoch will start,
        // until a correspondent transfer action transaction will be processed.
        // In such case, if a list of provided signatures for old epoch is not sufficient,
        // a message should be automatically reprocessed.
        // Special event helps to find such stuck messages.
        if (msgAction == Action.TRANSFER) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success,) = address(this).call(abi.encodeWithSelector(
                    this.checkSignedMessage.selector,
                    epoch,
                    msgHash,
                    signatures
                ));
            if (!success) {
                emit RescheduleTransferMessage(msgHash);
                return;
            }
        } else {
            msgEpoch = message._decodeEpoch();
            checkSignedMessage(msgEpoch, msgHash, signatures);

            if (msgAction == Action.CONFIRM_KEYGEN || msgAction == Action.CANCEL_KEYGEN) {
                require(msgEpoch == nextEpoch, "Incorrect message epoch");
            } else {
                require(msgEpoch == epoch, "Incorrect message epoch");
            }
        }
        handledMessages[msgHash] = true;

        if (msgAction == Action.CONFIRM_KEYGEN) {
            // [3,22] - foreign address bytes
            require(message.length == 23, "Incorrect message length");
            address foreignAddress = message._decodeAddress();
            _confirmKeygen(bytes20(foreignAddress));
        } else if (msgAction == Action.CONFIRM_FUNDS_TRANSFER) {
            require(message.length == 3, "Incorrect message length");
            _confirmFundsTransfer();
        } else if (msgAction == Action.CONFIRM_CLOSE_EPOCH) {
            require(message.length == 3, "Incorrect message length");
            _confirmCloseEpoch();
        } else if (msgAction == Action.START_VOTING) {
            require(message.length == 3, "Incorrect message length");
            _startVoting();
        } else if (msgAction == Action.ADD_VALIDATOR) {
            // [3,22] - address, [23,31] - extra data
            require(message.length == 32, "Incorrect message length");
            address validator = message._decodeAddress();
            _addValidator(validator);
        } else if (msgAction == Action.REMOVE_VALIDATOR) {
            // [3,22] - address, [23,31] - extra data
            require(message.length == 32, "Incorrect message length");
            address validator = message._decodeAddress();
            _removeValidator(validator);
        } else if (msgAction == Action.CHANGE_THRESHOLD) {
            // [3,4] - threshold, [5,31] - extra data
            require(message.length == 32, "Incorrect message length");
            uint16 threshold = message._decodeUint16();
            _changeThreshold(threshold);
        } else if (msgAction == Action.CHANGE_CLOSE_EPOCH) {
            // [3] - closeEpoch, [4,31] - extra data
            require(message.length == 32, "Incorrect message length");
            bool closeEpoch = message._decodeBoolean();
            _changeCloseEpoch(closeEpoch);
        } else if (msgAction == Action.START_KEYGEN) {
            // [3-31] - extra data
            require(message.length == 32, "Incorrect message length");
            _startKeygen();
        } else if (msgAction == Action.CANCEL_KEYGEN) {
            // [3-31] - extra data
            require(message.length == 32, "Incorrect message length");
            _cancelKeygen();
        } else if (msgAction == Action.TRANSFER) {
            // [1,32] - txHash, [33,52] - address, [53,64] - value
            require(message.length == 65, "Incorrect message length");
            (address to, uint96 value) = message._decodeTransfer();
            _transfer(to, value);
        } else if (msgAction == Action.CHANGE_MIN_PER_TX_LIMIT) {
            // [3,14] - new limit, [15,31] - extra data
            require(message.length == 32, "Incorrect message length");
            uint96 limit = message._decodeUint96();
            _changeMinPerTxLimit(limit);
        } else if (msgAction == Action.CHANGE_MAX_PER_TX_LIMIT) {
            // [3,14] - new limit, [15,31] - extra data
            require(message.length == 32, "Incorrect message length");
            uint96 limit = message._decodeUint96();
            _changeMaxPerTxLimit(limit);
        } else if (msgAction == Action.INCREASE_EXECUTION_MAX_TX_LIMIT) {
            // [3,14] - new limit, [15,31] - extra data
            require(message.length == 32, "Incorrect message length");
            uint96 limit = message._decodeUint96();
            _increaseExecutionMaxLimit(limit);
        } else if (msgAction == Action.DECREASE_EXECUTION_MIN_TX_LIMIT) {
            // [3,14] - new limit, [15,31] - extra data
            require(message.length == 32, "Incorrect message length");
            uint96 limit = message._decodeUint96();
            _decreaseExecutionMinLimit(limit);
        } else {// Action.CHANGE_RANGE_SIZE
            // [3,4] - rangeSize, [5,31] - extra data
            require(message.length == 32, "Incorrect message length");
            uint16 rangeSize = message._decodeUint16();
            _changeRangeSize(rangeSize);
        }
        // invalid actions will not reach this line, since casting uint8 to Action will revert execution

        emit AppliedMessage(message);
    }

    function checkSignedMessage(uint16 msgEpoch, bytes32 msgHash, bytes memory signatures) public view {
        require(signatures.length % SIGNATURE_SIZE == 0, "Incorrect signatures length");

        require(!handledMessages[msgHash], "Tx was already handled");

        require(msgEpoch > 0 && (msgEpoch == epoch || msgEpoch == nextEpoch), "Invalid epoch number");

        uint signaturesNum = signatures.length / SIGNATURE_SIZE;

        address[] memory possibleValidators = getValidators(msgEpoch);

        bytes32 r;
        bytes32 s;
        uint8 v;

        uint16 validSignatures = 0;
        for (uint i = 0; i < signaturesNum; i++) {
            uint offset = i * SIGNATURE_SIZE;

            assembly {
                r := mload(add(add(signatures, 32), offset))
                s := mload(add(add(signatures, 64), offset))
                v := byte(0, mload(add(add(signatures, 96), offset)))
            }

            address signer = ecrecover(msgHash, v, r, s);
            for (uint j = 0; j < possibleValidators.length; j++) {
                if (possibleValidators[j] == signer) {
                    delete possibleValidators[j];
                    validSignatures++;
                    break;
                }
            }
        }
        require(validSignatures >= getThreshold(msgEpoch), "Not enough valid signatures");
    }
}
