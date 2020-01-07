pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BridgeConfig {
    uint96 internal constant LIMITS_LOWER_BOUND = 10 ** 10;
    uint96 public executionMinLimit;
    uint96 public executionMaxLimit;

    uint96 public minPerTxLimit;
    uint96 public maxPerTxLimit;

    uint32 public rangeSizeStartBlock;
    uint16 public rangeSizeVersion;
    uint16 public rangeSize;

    IERC20 public tokenContract;
}
