// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IZkEmailFluVerifier} from 'src/interfaces/IZkEmailFluVerifier.sol';

contract MockFluClaimVerifier {
  bytes32 public nullifier = keccak256('mock-nullifier');
  bool public shouldRevert;

  uint256 public lastSafetyNetId;
  address public lastClaimant;
  bytes public lastProof;

  function setNullifier(bytes32 _nullifier) external {
    nullifier = _nullifier;
  }

  function setShouldRevert(bool _shouldRevert) external {
    shouldRevert = _shouldRevert;
  }

  function verifyFluClaim(uint256 _safetyNetId, address _claimant, bytes calldata _proof) external returns (bytes32) {
    if (shouldRevert) revert IZkEmailFluVerifier.InvalidProof();

    lastSafetyNetId = _safetyNetId;
    lastClaimant = _claimant;
    lastProof = _proof;

    return nullifier;
  }
}
