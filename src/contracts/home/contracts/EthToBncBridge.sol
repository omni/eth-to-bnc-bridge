pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./UpdatableBridge.sol";

contract EthToBncBridge is UpdatableBridge {
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
        require(threshold <= validators.length);
        require(threshold > 0);
        require(limits[0] >= 10 ** 10);
        require(limits[0] <= limits[1]);
        require(rangeSize > 0);

        tokenContract = IERC20(_tokenContract);

        epoch = 0;
        status = Status.KEYGEN;
        nextEpoch = 1;

        states[nextEpoch] = State({
            validators : validators,
            threshold : threshold,
            rangeSize : rangeSize,
            startBlock : 0,
            endBlock : UPPER_BOUND,
            nonce : UPPER_BOUND,
            x : 0,
            y : 0,
            closeEpoch : closeEpoch,
            minTxLimit : limits[0],
            maxTxLimit : limits[1]
        });

        emit NewEpoch(0, 1);
    }

    function exchange(uint96 value) public ready {
        require(value >= getMinPerTx() && value <= getMaxPerTx());

        uint32 txRange = (uint32(block.number) - getStartBlock()) / uint32(getRangeSize());
        if (!usedExchangeRanges[keccak256(abi.encodePacked(txRange, epoch))]) {
            usedExchangeRanges[keccak256(abi.encodePacked(txRange, epoch))] = true;
            states[epoch].nonce++;
        }

        tokenContract.transferFrom(msg.sender, address(this), value);
        emit ExchangeRequest(value, getNonce());
    }
}
