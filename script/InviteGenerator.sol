// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from 'forge-std/Script.sol';

/// @title InviteGenerator
/// @author @exo404
/// @author @RonTuretzky
/// @notice Utility contract that produces Safety Net invite signatures matching the on-chain verification logic
contract InviteGenerator is Script {
  /// @notice Invite signing domain name used for EIP-712 signatures
  string private constant _INVITE_SIGNING_DOMAIN = 'SafetyNetInvite';

  /// @notice Invite signing version used for EIP-712 signatures
  string private constant _INVITE_SIGNATURE_VERSION = '1';

  /// @notice EIP-712 type hash for invite signatures
  bytes32 private constant _INVITE_TYPEHASH = keccak256('Invite(uint256 safetyNetId,uint256 nonce)');

  /// @notice EIP-712 domain type hash
  bytes32 private constant _EIP712_DOMAIN_TYPEHASH = keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');

  /// @notice Hashed domain name for invite signatures
  bytes32 private constant _INVITE_DOMAIN_NAME_HASH = keccak256(bytes(_INVITE_SIGNING_DOMAIN));

  /// @notice Hashed version for invite signatures
  bytes32 private constant _INVITE_DOMAIN_VERSION_HASH = keccak256(bytes(_INVITE_SIGNATURE_VERSION));

  /// @notice Returns the struct hash of an invite
  function hashInvite(uint256 _safetyNetId, uint256 _nonce) public pure returns (bytes32) {
    return keccak256(abi.encode(_INVITE_TYPEHASH, _safetyNetId, _nonce));
  }

  /// @notice Returns the domain separator for a Safety Net contract on a given chain
  function domainSeparator(uint256 _chainId, address _verifyingContract) public pure returns (bytes32) {
    return keccak256(
      abi.encode(
        _EIP712_DOMAIN_TYPEHASH,
        _INVITE_DOMAIN_NAME_HASH,
        _INVITE_DOMAIN_VERSION_HASH,
        _chainId,
        _verifyingContract
      )
    );
  }

  /// @notice Computes the full EIP-712 digest for a Safety Net invite
  function inviteDigest(
    uint256 _safetyNetId,
    uint256 _nonce,
    uint256 _chainId,
    address _verifyingContract
  ) public pure returns (bytes32) {
    return keccak256(abi.encodePacked('\x19\x01', domainSeparator(_chainId, _verifyingContract), hashInvite(_safetyNetId, _nonce)));
  }

  /// @notice Generates a single invite signature using the configured chain id
  /// @param _privateKey Private key of the Safety Net owner 
  /// @param _safetyNetId Safety Net identifier
  /// @param _nonce Unique nonce for the invite
  /// @param _verifyingContract Address of the Safety Net contract instance
  function generateInvite(
    uint256 _privateKey,
    uint256 _safetyNetId,
    uint256 _nonce,
    address _verifyingContract
  ) external view returns (bytes memory) {
    return _generateInvite(_privateKey, _safetyNetId, _nonce, block.chainid, _verifyingContract);
  }

  /// @notice Generates multiple invite signatures using the configured chain id
  function generateInvites(
    uint256 _privateKey,
    uint256 _safetyNetId,
    uint256[] calldata _nonces,
    address _verifyingContract
  ) external view returns (bytes[] memory _signatures) {
    _signatures = new bytes[](_nonces.length);
    for (uint256 i = 0; i < _nonces.length; i++) {
      _signatures[i] = _generateInvite(_privateKey, _safetyNetId, _nonces[i], block.chainid, _verifyingContract);
    }
    return _signatures;
  }

  /// @notice Derives the address corresponding to a private key (testing only)
  function addressFromPrivateKey(uint256 _privateKey) external pure returns (address) {
    return vm.addr(_privateKey);
  }

  function _generateInvite(
    uint256 _privateKey,
    uint256 _safetyNetId,
    uint256 _nonce,
    uint256 _chainId,
    address _verifyingContract
  ) private pure returns (bytes memory) {
    bytes32 _digest = inviteDigest(_safetyNetId, _nonce, _chainId, _verifyingContract);
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, _digest);
    return abi.encodePacked(r, s, v);
  }
}
