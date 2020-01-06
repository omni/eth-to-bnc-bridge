pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./BridgeMessageProcessor.sol";

contract EthToBncBridge is BridgeMessageProcessor {
    event ExchangeRequest(uint96 value, uint32 nonce);

    mapping(bytes32 => bool) public usedExchangeRanges;

    constructor(
        uint16 threshold,
        address[] memory validators,
        address _tokenContract,
        uint96[2] memory limits,
        uint16 rangeSize,
        bool closeEpoch
    ) public {
        require(threshold > 0 && threshold <= validators.length, "Incorrect threshold");
        require(limits[0] >= 10 ** 10 && limits[0] <= limits[1], "Incorrect limits");
        require(rangeSize > 0, "Range size must be positive");

        tokenContract = IERC20(_tokenContract);

        epoch = 0;
        state = State.KEYGEN;
        nextEpoch = 1;

        _initNextEpoch(validators, threshold, rangeSize, closeEpoch, limits[0], limits[1]);

        emit NewEpoch(0, 1);
    }

    function exchange(uint96 value) public ready {
        require(value >= getMinPerTx() && value <= getMaxPerTx(), "Value lies outside of allowed limits");

        uint32 txRange = (uint32(block.number) - getStartBlock()) / uint32(getRangeSize());
        if (!usedExchangeRanges[keccak256(abi.encodePacked(txRange, epoch))]) {
            usedExchangeRanges[keccak256(abi.encodePacked(txRange, epoch))] = true;
            epochStates[epoch].nonce++;
        }

        tokenContract.transferFrom(msg.sender, address(this), value);
        emit ExchangeRequest(value, getNonce());
    }
}
