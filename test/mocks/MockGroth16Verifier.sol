// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IGroth16Verifier} from 'src/interfaces/IGroth16Verifier.sol';

contract MockGroth16Verifier is IGroth16Verifier {
  bool public result = true;

  function setResult(bool _result) external {
    result = _result;
  }

  function verifyProof(
    uint256[2] calldata,
    uint256[2][2] calldata,
    uint256[2] calldata,
    uint256[6] calldata
  ) external view override returns (bool) {
    return result;
  }
}
