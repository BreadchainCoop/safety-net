// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Strings} from '@openzeppelin/contracts/utils/Strings.sol';
import {Test} from 'forge-std/Test.sol';

import {ZkEmailFluVerifier} from 'src/contracts/ZkEmailFluVerifier.sol';
import {IZkEmailFluVerifier} from 'src/interfaces/IZkEmailFluVerifier.sol';
import {MockDKIMRegistry} from 'test/mocks/MockDKIMRegistry.sol';
import {MockGroth16Verifier} from 'test/mocks/MockGroth16Verifier.sol';

/// @dev Exposes the internal claimant-address packing so tests exercise the real code path
contract ZkEmailFluVerifierHarness is ZkEmailFluVerifier {
  constructor(address _owner, address _safetyNet, address _dkimRegistry) ZkEmailFluVerifier(_owner, _safetyNet, _dkimRegistry) {}

  function packedClaimantAddress(address _claimant) external pure returns (uint256 _lo, uint256 _hi) {
    return _packedClaimantAddress(_claimant);
  }
}

abstract contract ZkEmailFluVerifierUnitBase is Test {
  ZkEmailFluVerifier internal _verifier;
  MockDKIMRegistry internal _dkimRegistry;
  MockGroth16Verifier internal _groth16;

  address internal _owner = makeAddr('owner');
  address internal _safetyNet = makeAddr('safetyNet');
  address internal _claimant = makeAddr('claimant');
  address internal _impostor = makeAddr('impostor');

  string internal constant _DOMAIN = 'kp.org';
  bytes32 internal constant _PUBKEY_HASH = bytes32(uint256(0xd11d));
  bytes32 internal constant _COMMITMENT = bytes32(uint256(0xc0ffee));
  uint256 internal constant _HEADER_HASH_HI = 0xaaaa;
  uint256 internal constant _HEADER_HASH_LO = 0xbbbb;

  function setUp() public virtual {
    _dkimRegistry = new MockDKIMRegistry();
    _groth16 = new MockGroth16Verifier();
    _verifier = new ZkEmailFluVerifier(_owner, _safetyNet, address(_dkimRegistry));

    // Default happy-path fixtures: registered provider, registered DKIM key, aged commitment
    vm.prank(_owner);
    _verifier.setProvider(_DOMAIN, address(_groth16), true);
    _dkimRegistry.setKeyHash(_DOMAIN, _PUBKEY_HASH, true);

    vm.prank(_claimant);
    _verifier.registerEmailCommitment(_COMMITMENT);
    vm.warp(block.timestamp + _verifier.commitmentDelay());
  }

  // ---------- helpers ----------

  /// @dev Mirrors the contract's packing: lowercase 0x-prefixed hex string, 31 bytes LE per field
  function _packAddress(address _addr) internal pure returns (uint256 _lo, uint256 _hi) {
    bytes memory _hex = bytes(Strings.toHexString(_addr));
    for (uint256 i = 0; i < 31; i++) {
      _lo |= uint256(uint8(_hex[i])) << (8 * i);
    }
    for (uint256 i = 31; i < 42; i++) {
      _hi |= uint256(uint8(_hex[i])) << (8 * (i - 31));
    }
  }

  function _validProofFor(address _addr) internal pure returns (IZkEmailFluVerifier.FluClaimProof memory _proof) {
    (uint256 _lo, uint256 _hi) = _packAddress(_addr);
    _proof = IZkEmailFluVerifier.FluClaimProof({
      domain: _DOMAIN,
      a: [uint256(1), uint256(2)],
      b: [[uint256(3), uint256(4)], [uint256(5), uint256(6)]],
      c: [uint256(7), uint256(8)],
      signals: [uint256(_PUBKEY_HASH), _HEADER_HASH_HI, _HEADER_HASH_LO, uint256(_COMMITMENT), 0, _lo, _hi]
    });
  }

  function _encode(IZkEmailFluVerifier.FluClaimProof memory _proof) internal pure returns (bytes memory) {
    return abi.encode(_proof);
  }

  function _verifyAs(address _caller, uint256 _safetyNetId, address _forClaimant, bytes memory _proof) internal returns (bytes32) {
    vm.prank(_caller);
    return _verifier.verifyFluClaim(_safetyNetId, _forClaimant, _proof);
  }

  function _expectedNullifier() internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_HEADER_HASH_HI, _HEADER_HASH_LO));
  }
}

contract ZkEmailFluVerifierUnitConstructor is ZkEmailFluVerifierUnitBase {
  function test_ConstructorSetsConfig() public view {
    assertEq(_verifier.owner(), _owner);
    assertEq(_verifier.SAFETY_NET(), _safetyNet);
    assertEq(_verifier.DKIM_REGISTRY(), address(_dkimRegistry));
    assertEq(_verifier.claimCooldown(), 90 days);
    assertEq(_verifier.commitmentDelay(), 7 days);
  }

  function test_ConstructorRevertsOnZeroSafetyNet() public {
    vm.expectRevert(IZkEmailFluVerifier.InvalidAddressZero.selector);
    new ZkEmailFluVerifier(_owner, address(0), address(_dkimRegistry));
  }

  function test_ConstructorRevertsOnZeroDkimRegistry() public {
    vm.expectRevert(IZkEmailFluVerifier.InvalidAddressZero.selector);
    new ZkEmailFluVerifier(_owner, _safetyNet, address(0));
  }
}

contract ZkEmailFluVerifierUnitAdmin is ZkEmailFluVerifierUnitBase {
  function test_SetProviderStoresConfigAndEmits() public {
    address _newVerifier = makeAddr('groth16');
    vm.expectEmit();
    emit IZkEmailFluVerifier.ProviderSet(keccak256('healow.com'), 'healow.com', _newVerifier, true);

    vm.prank(_owner);
    _verifier.setProvider('healow.com', _newVerifier, true);

    (address _stored, bool _enabled) = _verifier.providers(keccak256('healow.com'));
    assertEq(_stored, _newVerifier);
    assertTrue(_enabled);
  }

  function test_SetProviderCanDisable() public {
    vm.prank(_owner);
    _verifier.setProvider(_DOMAIN, address(0), false);

    (address _stored, bool _enabled) = _verifier.providers(keccak256(bytes(_DOMAIN)));
    assertEq(_stored, address(0));
    assertFalse(_enabled);
  }

  function test_SetProviderRevertsWhenEnablingZeroVerifier() public {
    vm.prank(_owner);
    vm.expectRevert(IZkEmailFluVerifier.InvalidGroth16Verifier.selector);
    _verifier.setProvider(_DOMAIN, address(0), true);
  }

  function test_SetProviderRevertsForNonOwner() public {
    vm.prank(_impostor);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _impostor));
    _verifier.setProvider(_DOMAIN, address(_groth16), true);
  }

  function test_SetClaimCooldownStoresAndEmits() public {
    vm.expectEmit();
    emit IZkEmailFluVerifier.ClaimCooldownSet(30 days);

    vm.prank(_owner);
    _verifier.setClaimCooldown(30 days);

    assertEq(_verifier.claimCooldown(), 30 days);
  }

  function test_SetClaimCooldownRevertsForNonOwner() public {
    vm.prank(_impostor);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _impostor));
    _verifier.setClaimCooldown(30 days);
  }

  function test_SetCommitmentDelayStoresAndEmits() public {
    vm.expectEmit();
    emit IZkEmailFluVerifier.CommitmentDelaySet(1 days);

    vm.prank(_owner);
    _verifier.setCommitmentDelay(1 days);

    assertEq(_verifier.commitmentDelay(), 1 days);
  }

  function test_SetCommitmentDelayRevertsForNonOwner() public {
    vm.prank(_impostor);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _impostor));
    _verifier.setCommitmentDelay(1 days);
  }
}

contract ZkEmailFluVerifierUnitCommitments is ZkEmailFluVerifierUnitBase {
  function test_RegisterEmailCommitmentStoresAndEmits() public {
    bytes32 _commitment = bytes32(uint256(0xbeef));

    vm.expectEmit();
    emit IZkEmailFluVerifier.EmailCommitmentRegistered(_impostor, _commitment);

    vm.prank(_impostor);
    _verifier.registerEmailCommitment(_commitment);

    assertEq(_verifier.emailCommitments(_impostor), _commitment);
    assertEq(_verifier.emailCommitmentSetAt(_impostor), block.timestamp);
  }

  function test_RegisterEmailCommitmentRevertsOnZero() public {
    vm.prank(_impostor);
    vm.expectRevert(IZkEmailFluVerifier.InvalidCommitment.selector);
    _verifier.registerEmailCommitment(bytes32(0));
  }

  function test_ReRegisterResetsWaitingPeriod() public {
    vm.prank(_claimant);
    _verifier.registerEmailCommitment(_COMMITMENT);

    vm.expectRevert(IZkEmailFluVerifier.EmailCommitmentTooRecent.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_RegisterRevertsWhenCommitmentHeldByAnother() public {
    // Copying another member's public commitment value is worthless: first-come uniqueness
    vm.prank(_impostor);
    vm.expectRevert(IZkEmailFluVerifier.CommitmentAlreadyRegistered.selector);
    _verifier.registerEmailCommitment(_COMMITMENT);
  }

  function test_ReRegisterOwnCommitmentAllowed() public {
    vm.prank(_claimant);
    _verifier.registerEmailCommitment(_COMMITMENT);

    assertEq(_verifier.commitmentHolders(_COMMITMENT), _claimant);
  }

  function test_ReRegisterFreesPreviousCommitment() public {
    vm.prank(_claimant);
    _verifier.registerEmailCommitment(bytes32(uint256(0xbeef)));

    // The old value is released and claimable by someone else
    vm.prank(_impostor);
    _verifier.registerEmailCommitment(_COMMITMENT);

    assertEq(_verifier.commitmentHolders(_COMMITMENT), _impostor);
    assertEq(_verifier.emailCommitments(_claimant), bytes32(uint256(0xbeef)));
  }

  function test_ClearEmailCommitmentRecoversSquattedValue() public {
    // The owner clears the squatter; the rightful member can then register the value
    vm.expectEmit();
    emit IZkEmailFluVerifier.EmailCommitmentCleared(_claimant, _COMMITMENT);

    vm.prank(_owner);
    _verifier.clearEmailCommitment(_claimant);

    assertEq(_verifier.emailCommitments(_claimant), bytes32(0));
    assertEq(_verifier.emailCommitmentSetAt(_claimant), 0);
    assertEq(_verifier.commitmentHolders(_COMMITMENT), address(0));

    vm.prank(_impostor);
    _verifier.registerEmailCommitment(_COMMITMENT);
    assertEq(_verifier.commitmentHolders(_COMMITMENT), _impostor);
  }

  function test_ClearedMemberCannotClaim() public {
    vm.prank(_owner);
    _verifier.clearEmailCommitment(_claimant);

    vm.expectRevert(IZkEmailFluVerifier.EmailCommitmentNotSet.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_ClearEmailCommitmentRevertsForNonOwner() public {
    vm.prank(_impostor);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _impostor));
    _verifier.clearEmailCommitment(_claimant);
  }
}

contract ZkEmailFluVerifierUnitVerify is ZkEmailFluVerifierUnitBase {
  function test_VerifyRevertsForNonSafetyNetCaller() public {
    vm.expectRevert(IZkEmailFluVerifier.OnlySafetyNet.selector);
    _verifyAs(_impostor, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifyRevertsForUnknownDomain() public {
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.domain = 'attacker.example';

    vm.expectRevert(IZkEmailFluVerifier.UnknownProvider.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));
  }

  function test_VerifyRevertsForDisabledProvider() public {
    vm.prank(_owner);
    _verifier.setProvider(_DOMAIN, address(_groth16), false);

    vm.expectRevert(IZkEmailFluVerifier.UnknownProvider.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifyRevertsWithoutEmailCommitment() public {
    vm.expectRevert(IZkEmailFluVerifier.EmailCommitmentNotSet.selector);
    _verifyAs(_safetyNet, 0, _impostor, _encode(_validProofFor(_impostor)));
  }

  function test_VerifyRevertsOnRecipientMismatch() public {
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.signals[3] = uint256(0xdead);

    vm.expectRevert(IZkEmailFluVerifier.RecipientMismatch.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));
  }

  function test_VerifyRevertsOnClaimantMismatch() public {
    // Proof bound to the impostor's address cannot be settled for the claimant
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_impostor);
    _proof.signals[3] = uint256(_COMMITMENT);

    vm.expectRevert(IZkEmailFluVerifier.ClaimantMismatch.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));
  }

  function test_VerifyRevertsOnClaimantMismatchHiFieldOnly() public {
    // signals[5] matches; only the second packed field (hex chars 31..41) is corrupted
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.signals[6] ^= 1;

    vm.expectRevert(IZkEmailFluVerifier.ClaimantMismatch.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));
  }

  function test_VerifyRevertsOnUnregisteredDkimKeyHash() public {
    _dkimRegistry.setKeyHash(_DOMAIN, _PUBKEY_HASH, false);

    vm.expectRevert(IZkEmailFluVerifier.InvalidDkimKeyHash.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifyRevertsOnInvalidGroth16Proof() public {
    _groth16.setResult(false);

    vm.expectRevert(IZkEmailFluVerifier.InvalidProof.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifySucceedsAndConsumesNullifier() public {
    vm.expectEmit();
    emit IZkEmailFluVerifier.FluClaimVerified(1, _claimant, keccak256(bytes(_DOMAIN)), _expectedNullifier());

    bytes32 _nullifier = _verifyAs(_safetyNet, 1, _claimant, _encode(_validProofFor(_claimant)));

    assertEq(_nullifier, _expectedNullifier());
    assertTrue(_verifier.usedNullifiers(_nullifier));
    assertEq(_verifier.lastFluClaimAt(1, _claimant), block.timestamp);
  }

  function test_VerifyRevertsOnNullifierReuseAcrossNets() public {
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));

    // Same email on a different Safety Net: the cooldown is per-net, but the nullifier is global
    vm.expectRevert(IZkEmailFluVerifier.EmailAlreadyUsed.selector);
    _verifyAs(_safetyNet, 1, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifyRevertsDuringCooldown() public {
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));

    // A different email (fresh nullifier) within the cooldown window still cannot claim
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.signals[1] = 0xcccc;

    vm.warp(block.timestamp + _verifier.claimCooldown() - 1);
    vm.expectRevert(IZkEmailFluVerifier.FluClaimCooldownActive.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));
  }

  function test_VerifySucceedsWithNewEmailAfterCooldown() public {
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));

    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.signals[1] = 0xcccc;

    vm.warp(block.timestamp + _verifier.claimCooldown());
    bytes32 _nullifier = _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));

    assertEq(_nullifier, keccak256(abi.encodePacked(uint256(0xcccc), _HEADER_HASH_LO)));
  }

  function test_VerifyCooldownIsPerSafetyNet() public {
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));

    // A different net with a different email is claimable immediately
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.signals[1] = 0xcccc;

    bytes32 _nullifier = _verifyAs(_safetyNet, 1, _claimant, _encode(_proof));
    assertEq(_nullifier, keccak256(abi.encodePacked(uint256(0xcccc), _HEADER_HASH_LO)));
  }
}

contract ZkEmailFluVerifierUnitPacking is ZkEmailFluVerifierUnitBase {
  ZkEmailFluVerifierHarness internal _harness;

  function setUp() public override {
    super.setUp();
    _harness = new ZkEmailFluVerifierHarness(_owner, _safetyNet, address(_dkimRegistry));
  }

  /// @dev Known-answer vectors computed independently (Python) from the documented convention:
  ///      lowercase 0x-prefixed hex string, 31 bytes per field, little-endian within each field —
  ///      pins the contract's packing rather than mirroring its algorithm
  function test_PackedClaimantAddressKnownAnswers() public view {
    (uint256 _lo, uint256 _hi) = _harness.packedClaimantAddress(0x1111111111111111111111111111111111111111);
    assertEq(_lo, 86_915_017_963_059_031_491_344_642_546_349_685_735_450_815_695_716_722_394_813_443_878_488_733_744);
    assertEq(_hi, 59_469_668_553_905_523_009_859_889);

    // Asymmetric bytes pin the byte order and the toHexString lowercasing
    (_lo, _hi) = _harness.packedClaimantAddress(0x00112233445566778899AABbCCdDeeFf00112233);
    assertEq(_lo, 179_144_434_638_763_799_183_550_014_940_510_725_384_338_242_523_750_365_209_731_981_891_609_851_952);
    assertEq(_hi, 61_896_983_444_902_184_088_921_701);
  }

  /// @dev Round-trip: unpacking the two packed fields must reproduce the lowercase hex string,
  ///      byte-for-byte, for any address
  function test_PackedClaimantAddressRoundTrip(address _addr) public view {
    (uint256 _lo, uint256 _hi) = _harness.packedClaimantAddress(_addr);

    bytes memory _unpacked = new bytes(42);
    for (uint256 i = 0; i < 31; i++) {
      _unpacked[i] = bytes1(uint8(_lo >> (8 * i)));
    }
    for (uint256 i = 31; i < 42; i++) {
      _unpacked[i] = bytes1(uint8(_hi >> (8 * (i - 31))));
    }

    assertEq(string(_unpacked), Strings.toHexString(_addr));
  }
}
