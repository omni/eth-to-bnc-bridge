pragma solidity ^0.5.0;

contract KeyValueStorage {
    mapping(bytes32 => bytes) public db;

    function setData(bytes32 id, bytes32 key, bytes memory data) public {
        db[encodeKey(msg.sender, id, key)] = data;
    }

    function getData(address from, bytes32 id, bytes32 key) view public returns (bytes memory) {
        return db[encodeKey(from, id, key)];
    }

    function encodeKey(address sender, bytes32 id, bytes32 key) private pure returns (bytes32 hash) {
        return keccak256(abi.encodePacked(sender, id, key));
    }
}
