pragma solidity ^0.5.0;

import "./KeyValueStorage.sol";
import "./SignedMessageStorage.sol";
import "./SignupStorage.sol";

// solhint-disable-next-line no-empty-blocks
contract SharedDB is KeyValueStorage, SignedMessageStorage, SignupStorage {}
