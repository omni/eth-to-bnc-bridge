pragma solidity ^0.5.0;

import "./KeyValueStorage.sol";
import "./SignedMessageStorage.sol";
import "./SignupStorage.sol";

contract SharedDB is KeyValueStorage, SignedMessageStorage, SignupStorage {}
