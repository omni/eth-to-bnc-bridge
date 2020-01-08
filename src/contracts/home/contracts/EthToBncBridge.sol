pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./BridgeMessageProcessor.sol";

contract EthToBncBridge is BridgeMessageProcessor {
    event ExchangeRequest(uint96 value, uint32 nonce);

    mapping(bytes32 => bool) public usedExchangeRanges;

    constructor(
        uint16 threshold,
        address[] memory validators,
        bool closeEpoch,
        address _tokenContract,
        uint96[2] memory homeLimits,
        uint96[2] memory foreignLimits,
        uint16 _rangeSize
    ) public {
        require(threshold > 0 && threshold <= validators.length, "Incorrect threshold");
        require(homeLimits[0] >= LIMITS_LOWER_BOUND
            && homeLimits[0] <= homeLimits[1], "Incorrect home limits");
        require(foreignLimits[0] >= LIMITS_LOWER_BOUND
            && foreignLimits[0] <= foreignLimits[1], "Incorrect foreign limits");
        require(_rangeSize > 0, "Range size must be positive");

        tokenContract = IERC20(_tokenContract);

        epoch = 0;
        state = State.KEYGEN;
        nextEpoch = 1;

        _initNextEpoch(validators, threshold, closeEpoch);
        rangeSize = _rangeSize;
        rangeSizeStartBlock = uint32(block.number);

        minPerTxLimit = homeLimits[0];
        maxPerTxLimit = homeLimits[1];

        executionMinLimit = foreignLimits[0];
        executionMaxLimit = foreignLimits[1];

        emit RangeSizeChanged(rangeSize);
        emit NewEpoch(0, 1);
    }

    function exchange(uint96 value) public ready {
        require(value >= minPerTxLimit && value <= maxPerTxLimit, "Value lies outside of the allowed limits");

        // current range number, starting from last change of range size
        uint32 txRangeNumber = (uint32(block.number) - rangeSizeStartBlock) / uint32(rangeSize);
        bytes32 txRangeId = keccak256(abi.encodePacked(rangeSizeVersion, txRangeNumber));

        // first exchange in the new range, triggers nonce increase
        if (!usedExchangeRanges[txRangeId]) {
            usedExchangeRanges[txRangeId] = true;
            epochStates[epoch].nonce++;
        }

        tokenContract.transferFrom(msg.sender, address(this), value);
        emit ExchangeRequest(value, getNonce());
    }
}
