const tokenAbi = [
  'function balanceOf(address account) view returns (uint256)'
]
const bridgeAbi = [
  'function getX() view returns (uint)',
  'function getY() view returns (uint)',
  'function epoch() view returns (uint)',
  'function getRangeSize() view returns (uint)',
  'function getNextRangeSize() view returns (uint)',
  'function getStartBlock() view returns (uint)',
  'function getNonce() view returns (uint)',
  'function nextEpoch() view returns (uint)',
  'function getThreshold() view returns (uint)',
  'function getNextThreshold() view returns (uint)',
  'function getValidators() view returns (address[])',
  'function getNextValidators() view returns (address[])',
  'function status() view returns (uint)',
  'function votesCount(bytes32) view returns (uint)',
  'function getNextPartyId(address a) view returns (uint)',
  'function confirmKeygen(uint x, uint y)',
  'function confirmFundsTransfer()',
  'function startVoting()',
  'function voteStartKeygen()',
  'function voteCancelKeygen()',
  'function voteAddValidator(address validator)',
  'function voteRemoveValidator(address validator)',
  'function voteChangeThreshold(uint threshold)',
  'function transfer(bytes32 hash, address to, uint value)'
]
const sharedDbAbi = [
  'function getSignupAddress(bytes32 hash, address[] validators, uint signupNumber) view returns (address)',
  'function getData(address from, bytes32 hash, bytes32 key) view returns (bytes)',
  'function getSignupNumber(bytes32 hash, address[] validators, address validator) view returns (uint)',
  'function setData(bytes32 hash, bytes32 key, bytes data)',
  'function signupSign(bytes32 hash)'
]

module.exports = {
  tokenAbi,
  bridgeAbi,
  sharedDbAbi
}
