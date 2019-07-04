pragma solidity ^0.5.0;

import './openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';

contract Bridge {

    IERC20 public tokenContract;

    event ReceivedTokens(address from, string recipient, uint value);

    constructor(address _tokenContract) public {
        tokenContract = IERC20(_tokenContract);
    }

    function requestAffirmation(uint value, string memory recipient) public {
        tokenContract.transfer(address(this), value);

        emit ReceivedTokens(msg.sender, recipient, value);
    }
}
