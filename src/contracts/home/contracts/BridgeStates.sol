pragma solidity ^0.5.0;

contract BridgeStates {
    enum State {
        READY, // bridge is in ready to perform operations
        CLOSING_EPOCH, // generating transaction for blocking binance side of the bridge
        VOTING, // voting for changing in next epoch, but still ready
        KEYGEN, //keygen, can be cancelled
        FUNDS_TRANSFER // funds transfer, cannot be cancelled
    }

    State public state;

    modifier ready {
        require(state == State.READY, "Not in ready state");
        _;
    }

    modifier closingEpoch {
        require(state == State.CLOSING_EPOCH, "Not in closing epoch state");
        _;
    }

    modifier voting {
        require(state == State.VOTING, "Not in voting state");
        _;
    }

    modifier keygen {
        require(state == State.KEYGEN, "Not in keygen state");
        _;
    }

    modifier fundsTransfer {
        require(state == State.FUNDS_TRANSFER, "Not in funds transfer state");
        _;
    }
}
