// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Strings} from '@openzeppelin/contracts/utils/Strings.sol';
import {Test} from 'forge-std/Test.sol';

import {ZkEmailFluVerifier} from 'src/contracts/ZkEmailFluVerifier.sol';
import {IZkEmailFluVerifier} from 'src/interfaces/IZkEmailFluVerifier.sol';
import {MockDKIMRegistry} from 'test/mocks/MockDKIMRegistry.sol';
import {MockGroth16Verifier} from 'test/mocks/MockGroth16Verifier.sol';

/// @dev Exposes the internal claimant packing so tests exercise the real code path
contract ZkEmailFluVerifierHarness is ZkEmailFluVerifier {
  constructor(
    address _owner,
    address _safetyNet,
    address _groth16,
    address _dkimRegistry
  ) ZkEmailFluVerifier(_owner, _safetyNet, _groth16, _dkimRegistry) {}

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

  string internal constant _PROVIDER = 'kp.org';
  string internal constant _BINDING = 'gmail.com';
  bytes32 internal constant _PUBKEY_A = bytes32(uint256(0xd11d));
  bytes32 internal constant _PUBKEY_B = bytes32(uint256(0x6ee1));
  uint256 internal constant _HEADER_HI = 0xaaaa;
  uint256 internal constant _HEADER_LO = 0xbbbb;

  function setUp() public virtual {
    _dkimRegistry = new MockDKIMRegistry();
    _groth16 = new MockGroth16Verifier();
    _verifier = new ZkEmailFluVerifier(_owner, _safetyNet, address(_groth16), address(_dkimRegistry));

    // Happy-path fixtures: both domains enabled, both DKIM keys registered
    vm.startPrank(_owner);
    _verifier.setProvider(_PROVIDER, true);
    _verifier.setBindingProvider(_BINDING, true);
    vm.stopPrank();
    _dkimRegistry.setKeyHash(_PROVIDER, _PUBKEY_A, true);
    _dkimRegistry.setKeyHash(_BINDING, _PUBKEY_B, true);
  }

  // ---------- helpers ----------

  /// @dev Mirrors the contract packing: lowercase 0x hex string, 31 bytes LE per field
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
      providerDomain: _PROVIDER,
      bindingDomain: _BINDING,
      a: [uint256(1), uint256(2)],
      b: [[uint256(3), uint256(4)], [uint256(5), uint256(6)]],
      c: [uint256(7), uint256(8)],
      signals: [uint256(_PUBKEY_A), uint256(_PUBKEY_B), _HEADER_HI, _HEADER_LO, _lo, _hi]
    });
  }

  function _encode(IZkEmailFluVerifier.FluClaimProof memory _proof) internal pure returns (bytes memory) {
    return abi.encode(_proof);
  }

  function _verifyAs(address _caller, uint256 _id, address _forClaimant, bytes memory _proof) internal returns (bytes32) {
    vm.prank(_caller);
    return _verifier.verifyFluClaim(_id, _forClaimant, _proof);
  }

  function _expectedNullifier() internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_HEADER_HI, _HEADER_LO));
  }
}

contract ZkEmailFluVerifierUnitConstructor is ZkEmailFluVerifierUnitBase {
  function test_ConstructorSetsConfig() public view {
    assertEq(_verifier.owner(), _owner);
    assertEq(_verifier.SAFETY_NET(), _safetyNet);
    assertEq(_verifier.GROTH16_VERIFIER(), address(_groth16));
    assertEq(_verifier.DKIM_REGISTRY(), address(_dkimRegistry));
    assertEq(_verifier.claimCooldown(), 90 days);
  }

  function test_ConstructorRevertsOnZeroSafetyNet() public {
    vm.expectRevert(IZkEmailFluVerifier.InvalidAddressZero.selector);
    new ZkEmailFluVerifier(_owner, address(0), address(_groth16), address(_dkimRegistry));
  }

  function test_ConstructorRevertsOnZeroGroth16() public {
    vm.expectRevert(IZkEmailFluVerifier.InvalidAddressZero.selector);
    new ZkEmailFluVerifier(_owner, _safetyNet, address(0), address(_dkimRegistry));
  }

  function test_ConstructorRevertsOnZeroDkimRegistry() public {
    vm.expectRevert(IZkEmailFluVerifier.InvalidAddressZero.selector);
    new ZkEmailFluVerifier(_owner, _safetyNet, address(_groth16), address(0));
  }
}

contract ZkEmailFluVerifierUnitAdmin is ZkEmailFluVerifierUnitBase {
  function test_SetProviderStoresAndEmits() public {
    vm.expectEmit();
    emit IZkEmailFluVerifier.ProviderSet(keccak256('healow.com'), 'healow.com', true);
    vm.prank(_owner);
    _verifier.setProvider('healow.com', true);
    assertTrue(_verifier.providerEnabled(keccak256('healow.com')));
  }

  function test_SetProviderCanDisable() public {
    vm.prank(_owner);
    _verifier.setProvider(_PROVIDER, false);
    assertFalse(_verifier.providerEnabled(keccak256(bytes(_PROVIDER))));
  }

  function test_SetProviderRevertsForNonOwner() public {
    vm.prank(_impostor);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _impostor));
    _verifier.setProvider(_PROVIDER, true);
  }

  function test_SetBindingProviderStoresAndEmits() public {
    vm.expectEmit();
    emit IZkEmailFluVerifier.BindingProviderSet(keccak256('outlook.com'), 'outlook.com', true);
    vm.prank(_owner);
    _verifier.setBindingProvider('outlook.com', true);
    assertTrue(_verifier.bindingProviderEnabled(keccak256('outlook.com')));
  }

  function test_SetBindingProviderRevertsForNonOwner() public {
    vm.prank(_impostor);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _impostor));
    _verifier.setBindingProvider(_BINDING, true);
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
}

contract ZkEmailFluVerifierUnitVerify is ZkEmailFluVerifierUnitBase {
  function test_VerifyRevertsForNonSafetyNetCaller() public {
    vm.expectRevert(IZkEmailFluVerifier.OnlySafetyNet.selector);
    _verifyAs(_impostor, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifyRevertsForUnknownProvider() public {
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.providerDomain = 'attacker.example';
    vm.expectRevert(IZkEmailFluVerifier.UnknownProvider.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));
  }

  function test_VerifyRevertsForDisabledProvider() public {
    vm.prank(_owner);
    _verifier.setProvider(_PROVIDER, false);
    vm.expectRevert(IZkEmailFluVerifier.UnknownProvider.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifyRevertsForUnknownBindingProvider() public {
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.bindingDomain = 'evil.example';
    vm.expectRevert(IZkEmailFluVerifier.UnknownBindingProvider.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));
  }

  function test_VerifyRevertsOnClaimantMismatch() public {
    // A proof whose subject-bound wallet is the impostor cannot be settled for the claimant
    vm.expectRevert(IZkEmailFluVerifier.ClaimantMismatch.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_impostor)));
  }

  function test_VerifyRevertsOnClaimantMismatchHiFieldOnly() public {
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.signals[5] ^= 1; // corrupt only the hi half of the packed wallet
    vm.expectRevert(IZkEmailFluVerifier.ClaimantMismatch.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));
  }

  function test_VerifyRevertsOnUnregisteredProviderKey() public {
    _dkimRegistry.setKeyHash(_PROVIDER, _PUBKEY_A, false);
    vm.expectRevert(IZkEmailFluVerifier.InvalidDkimKeyHash.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifyRevertsOnUnregisteredBindingKey() public {
    _dkimRegistry.setKeyHash(_BINDING, _PUBKEY_B, false);
    vm.expectRevert(IZkEmailFluVerifier.InvalidBindingDkimKeyHash.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifyRevertsOnInvalidGroth16Proof() public {
    _groth16.setResult(false);
    vm.expectRevert(IZkEmailFluVerifier.InvalidProof.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifySucceedsAndConsumesNullifier() public {
    vm.expectEmit();
    emit IZkEmailFluVerifier.FluClaimVerified(1, _claimant, keccak256(bytes(_PROVIDER)), _expectedNullifier());

    bytes32 _nullifier = _verifyAs(_safetyNet, 1, _claimant, _encode(_validProofFor(_claimant)));

    assertEq(_nullifier, _expectedNullifier());
    assertTrue(_verifier.usedNullifiers(_nullifier));
    assertEq(_verifier.lastFluClaimAt(1, _claimant), block.timestamp);
  }

  function test_VerifyRevertsOnNullifierReuseAcrossNets() public {
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
    vm.expectRevert(IZkEmailFluVerifier.EmailAlreadyUsed.selector);
    _verifyAs(_safetyNet, 1, _claimant, _encode(_validProofFor(_claimant)));
  }

  function test_VerifyRevertsDuringCooldown() public {
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
    // A different diagnosis email (fresh nullifier) within the cooldown still cannot claim
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.signals[2] = 0xcccc;
    vm.warp(block.timestamp + _verifier.claimCooldown() - 1);
    vm.expectRevert(IZkEmailFluVerifier.FluClaimCooldownActive.selector);
    _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));
  }

  function test_VerifySucceedsWithNewEmailAfterCooldown() public {
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.signals[2] = 0xcccc;
    vm.warp(block.timestamp + _verifier.claimCooldown());
    bytes32 _nullifier = _verifyAs(_safetyNet, 0, _claimant, _encode(_proof));
    assertEq(_nullifier, keccak256(abi.encodePacked(uint256(0xcccc), _HEADER_LO)));
  }

  function test_VerifyCooldownIsPerSafetyNet() public {
    _verifyAs(_safetyNet, 0, _claimant, _encode(_validProofFor(_claimant)));
    // A different net with a different email is claimable immediately
    IZkEmailFluVerifier.FluClaimProof memory _proof = _validProofFor(_claimant);
    _proof.signals[2] = 0xcccc;
    bytes32 _nullifier = _verifyAs(_safetyNet, 1, _claimant, _encode(_proof));
    assertEq(_nullifier, keccak256(abi.encodePacked(uint256(0xcccc), _HEADER_LO)));
  }
}

contract ZkEmailFluVerifierUnitPacking is ZkEmailFluVerifierUnitBase {
  ZkEmailFluVerifierHarness internal _harness;

  function setUp() public override {
    super.setUp();
    _harness = new ZkEmailFluVerifierHarness(_owner, _safetyNet, address(_groth16), address(_dkimRegistry));
  }

  /// @dev Known-answer vectors computed independently (Python), pinning the 31-byte LE packing of a
  ///      lowercase 0x hex address rather than mirroring the contract's own algorithm
  function test_PackedClaimantAddressKnownAnswers() public view {
    (uint256 _lo, uint256 _hi) = _harness.packedClaimantAddress(0x1111111111111111111111111111111111111111);
    assertEq(_lo, 86_915_017_963_059_031_491_344_642_546_349_685_735_450_815_695_716_722_394_813_443_878_488_733_744);
    assertEq(_hi, 59_469_668_553_905_523_009_859_889);

    (_lo, _hi) = _harness.packedClaimantAddress(0x00112233445566778899AABbCCdDeeFf00112233);
    assertEq(_lo, 179_144_434_638_763_799_183_550_014_940_510_725_384_338_242_523_750_365_209_731_981_891_609_851_952);
    assertEq(_hi, 61_896_983_444_902_184_088_921_701);
  }

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
