const tokenAbi = [
  'function balanceOf(address account) view returns (uint256)'
]
const bridgeAbi = [
  'function getForeignAddress() view returns (bytes20)',
  'function epoch() view returns (uint16)',
  'function rangeSize() view returns (uint16)',
  'function rangeSizeStartBlock() view returns (uint32)',
  'function minPerTxLimit() view returns (uint96)',
  'function maxPerTxLimit() view returns (uint96)',
  'function executionMinLimit() view returns (uint96)',
  'function executionMaxLimit() view returns (uint96)',
  'function getStartBlock() view returns (uint32)',
  'function getNonce() view returns (uint16)',
  'function nextEpoch() view returns (uint16)',
  'function getThreshold() view returns (uint16)',
  'function getThreshold(uint16 epoch) view returns (uint16)',
  'function getNextThreshold() view returns (uint16)',
  'function getValidators() view returns (address[])',
  'function getValidators(uint16 epoch) view returns (address[])',
  'function getNextValidators() view returns (address[])',
  'function getCloseEpoch() view returns (bool)',
  'function getNextCloseEpoch() view returns (bool)',
  'function state() view returns (uint8)',
  'function getNextPartyId(address partyAddress) view returns (uint16)',
  'function handledMessages(bytes32 msgHash) view returns (bool)',
  'function applyMessage(bytes message, bytes signatures)'
]
const sharedDbAbi = [
  'function getSignupAddress(bytes32 hash, address[] validators, uint16 signupNumber) view returns (address)',
  'function getData(address from, bytes32 hash, bytes32 key) view returns (bytes)',
  'function getSignupNumber(bytes32 hash, address[] validators, address validator) view returns (uint16)',
  'function isSignuped(bytes32 hash, address validator) view returns (bool)',
  'function getSignatures(bytes32 msgHash, address[] validators) view returns (bytes)',
  'function isResponsibleToSend(bytes32 msgHash, address[] validators, uint16 threshold) view returns (bool)',
  'function setData(bytes32 hash, bytes32 key, bytes data)',
  'function signup(bytes32 hash)',
  'function addSignature(bytes message, bytes rsv)'
]

module.exports = {
  tokenAbi,
  bridgeAbi,
  sharedDbAbi
}
