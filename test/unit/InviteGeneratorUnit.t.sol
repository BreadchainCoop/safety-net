// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from 'forge-std/Test.sol';
import {InviteGenerator} from 'script/InviteGenerator.sol';

contract InviteGeneratorUnit is Test {
  InviteGenerator internal inviteGenerator;
  string internal constant INVITE_SIGNING_DOMAIN = 'SafetyNetInvite';
  string internal constant INVITE_SIGNATURE_VERSION = '1';
  uint256 internal constant STRUCT_ID = 1;
  string internal constant STRUCT_NAME = 'safetyNet';
  uint256 internal constant NONCE = 1;
  uint256 internal constant CHAIN_ID = 1;
  address internal VERIFYING_CONTRACT;
  uint256 internal OWNER_PRIVATE_KEY;
  address internal OWNER_ADDRESS;


  function setUp() public {
    inviteGenerator = new InviteGenerator(INVITE_SIGNING_DOMAIN, INVITE_SIGNATURE_VERSION, STRUCT_NAME);
    VERIFYING_CONTRACT = address(inviteGenerator);
    (OWNER_ADDRESS, OWNER_PRIVATE_KEY) = makeAddrAndKey("owner");
  }

  function test_shouldReturnsHashInvite() public {
    bytes32 expectedHash = keccak256(
      abi.encodePacked(keccak256('Invite(uint256 safetyNetId,uint256 nonce)'), STRUCT_ID, NONCE)
    );
    bytes32 actualHash = inviteGenerator.hashInvite(STRUCT_ID, NONCE);
    assertEq(expectedHash, actualHash);
  }

  function test_shouldReturnsDomainSeparator() public {
    bytes32 expectedDomainSeparator = keccak256(
      abi.encode(
        keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
        keccak256(bytes(INVITE_SIGNING_DOMAIN)),
        keccak256(bytes(INVITE_SIGNATURE_VERSION)),
        CHAIN_ID,
        VERIFYING_CONTRACT
      )
    );
    bytes32 actualDomainSeparator = inviteGenerator.domainSeparator(CHAIN_ID, VERIFYING_CONTRACT);
    assertEq(expectedDomainSeparator, actualDomainSeparator);
  }

  function test_shouldReturnsInviteDigest() public {
    bytes32 structHash = inviteGenerator.hashInvite(STRUCT_ID, NONCE);
    bytes32 domainSeparator = inviteGenerator.domainSeparator(CHAIN_ID, VERIFYING_CONTRACT);
    bytes32 expectedDigest = keccak256(abi.encode('\x19\x01', domainSeparator, structHash));
    bytes32 actualDigest =
      inviteGenerator.inviteDigest(STRUCT_ID, NONCE, CHAIN_ID, VERIFYING_CONTRACT);
    assertEq(expectedDigest, actualDigest);
  }

  function test_shouldGeneratesOneInvite() public {
    vm.chainId(CHAIN_ID);

    bytes memory signature = inviteGenerator.generateInvite(OWNER_PRIVATE_KEY, STRUCT_ID, NONCE, VERIFYING_CONTRACT);

    assertEq(signature.length, 65);

    bytes32 digest = inviteGenerator.inviteDigest(STRUCT_ID, NONCE, CHAIN_ID, VERIFYING_CONTRACT);
    address recoveredSigner = _recoverSigner(signature, digest);

    assertEq(recoveredSigner, OWNER_ADDRESS);
  }

  function test_shouldGeneratesMultipleInvites() public {
    vm.chainId(CHAIN_ID);
    uint256[] memory nonces = new uint256[](3);
    for (uint256 i = 0; i < nonces.length; i++) {
      nonces[i] = NONCE + i;
    }

    bytes[] memory signatures = inviteGenerator.generateInvites(OWNER_PRIVATE_KEY, STRUCT_ID, nonces, VERIFYING_CONTRACT);

    assertEq(signatures.length, nonces.length);

    for (uint256 i = 0; i < signatures.length; i++) {
      assertEq(signatures[i].length, 65);

      bytes32 digest = inviteGenerator.inviteDigest(STRUCT_ID, nonces[i], CHAIN_ID, VERIFYING_CONTRACT);
      address recoveredSigner = _recoverSigner(signatures[i], digest);

      assertEq(recoveredSigner, OWNER_ADDRESS);

      if (i > 0) {
        assertFalse(keccak256(signatures[i]) == keccak256(signatures[i - 1]));
      }
    }
  }

  function _recoverSigner(bytes memory signature, bytes32 digest) private pure returns (address) {
    (bytes32 r, bytes32 s, uint8 v) = _splitSignature(signature);
    return ecrecover(digest, v, r, s);
  }

  function _splitSignature(bytes memory signature) private pure returns (bytes32 r, bytes32 s, uint8 v) {
    require(signature.length == 65, 'InviteGeneratorUnit: invalid signature length');
    assembly {
      r := mload(add(signature, 0x20))
      s := mload(add(signature, 0x40))
      v := byte(0, mload(add(signature, 0x60)))
    }
    if (v < 27) {
      v += 27;
    }
  }
}
