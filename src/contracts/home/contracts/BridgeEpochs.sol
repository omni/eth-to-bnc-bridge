pragma solidity ^0.5.0;

contract BridgeEpochs {
    uint32 constant internal UPPER_BOUND = 0xffffffff;

    struct EpochState {
        address[] validators;
        uint32 startBlock;
        uint32 nonce;
        uint16 threshold;
        bool closeEpoch;
        bytes20 foreignAddress;
    }

    mapping(uint16 => EpochState) public epochStates;

    uint16 public epoch;
    uint16 public nextEpoch;

    function getParties() public view returns (uint16) {
        return getParties(epoch);
    }

    function getNextParties() public view returns (uint16) {
        return getParties(nextEpoch);
    }

    function getParties(uint16 _epoch) public view returns (uint16) {
        return uint16(epochStates[_epoch].validators.length);
    }

    function getThreshold() public view returns (uint16) {
        return getThreshold(epoch);
    }

    function getNextThreshold() public view returns (uint16) {
        return getThreshold(nextEpoch);
    }

    function getThreshold(uint16 _epoch) public view returns (uint16) {
        return epochStates[_epoch].threshold;
    }

    function getStartBlock() public view returns (uint32) {
        return getStartBlock(epoch);
    }

    function getStartBlock(uint16 _epoch) public view returns (uint32) {
        return epochStates[_epoch].startBlock;
    }

    function getNonce() public view returns (uint32) {
        return getNonce(epoch);
    }

    function getNonce(uint16 _epoch) public view returns (uint32) {
        return epochStates[_epoch].nonce;
    }

    function getForeignAddress() public view returns (bytes20) {
        return getForeignAddress(epoch);
    }

    function getForeignAddress(uint16 _epoch) public view returns (bytes20) {
        return epochStates[_epoch].foreignAddress;
    }

    function getCloseEpoch() public view returns (bool) {
        return getCloseEpoch(epoch);
    }

    function getNextCloseEpoch() public view returns (bool) {
        return getCloseEpoch(nextEpoch);
    }

    function getCloseEpoch(uint16 _epoch) public view returns (bool) {
        return epochStates[_epoch].closeEpoch;
    }

    function getNextPartyId(address partyAddress) public view returns (uint16) {
        address[] memory validators = getNextValidators();
        for (uint i = 0; i < getNextParties(); i++) {
            if (validators[i] == partyAddress)
                return uint16(i + 1);
        }
        return 0;
    }

    function getValidators() public view returns (address[] memory) {
        return getValidators(epoch);
    }

    function getNextValidators() public view returns (address[] memory) {
        return getValidators(nextEpoch);
    }

    function getValidators(uint16 _epoch) public view returns (address[] memory) {
        return epochStates[_epoch].validators;
    }

    function _initNextEpoch(address[] memory _validators, uint16 _threshold, bool _closeEpoch) internal {
        epochStates[nextEpoch] = EpochState({
            validators : _validators,
            threshold : _threshold,
            startBlock : 0,
            nonce : UPPER_BOUND,
            foreignAddress : bytes20(0),
            closeEpoch : _closeEpoch
        });
    }
}
