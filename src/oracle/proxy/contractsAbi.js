const tokenAbi = [
  'function balanceOf(address account) view returns (uint256)'
]
const bridgeAbi = [
  'function getX() view returns (uint256)',
  'function getY() view returns (uint256)',
  'function epoch() view returns (uint16)',
  'function getRangeSize() view returns (uint16)',
  'function getNextRangeSize() view returns (uint16)',
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
  'function status() view returns (uint8)',
  'function votesCount(bytes32) view returns (uint16)',
  'function getNextPartyId(address a) view returns (uint16)',
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
