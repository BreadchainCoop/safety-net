// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IDKIMRegistry} from '@zk-email/contracts/interfaces/IDKIMRegistry.sol';

contract MockDKIMRegistry is IDKIMRegistry {
  mapping(string domain => mapping(bytes32 keyHash => bool valid)) public keyHashes;

  function setKeyHash(string memory _domain, bytes32 _keyHash, bool _valid) external {
    keyHashes[_domain][_keyHash] = _valid;
  }

  function isDKIMPublicKeyHashValid(string memory _domainName, bytes32 _publicKeyHash) external view override returns (bool) {
    return keyHashes[_domainName][_publicKeyHash];
  }
}
