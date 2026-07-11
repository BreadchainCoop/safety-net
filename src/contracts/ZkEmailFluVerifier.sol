// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Strings} from '@openzeppelin/contracts/utils/Strings.sol';
import {IDKIMRegistry} from '@zk-email/contracts/interfaces/IDKIMRegistry.sol';

import {IGroth16Verifier} from '../interfaces/IGroth16Verifier.sol';
import {IZkEmailFluVerifier} from '../interfaces/IZkEmailFluVerifier.sol';

/**
 * @title ZkEmailFluVerifier
 * @notice Standalone extension that lets SafetyNet settle flu claims instantly — no contest/voting
 *         phase — against a ZK Email proof that a member holds a DKIM-signed diagnosis email from an
 *         allowlisted healthcare sender AND controls the inbox it was sent to (binding the payout to
 *         their wallet), without revealing the email address on-chain and with no pre-registration.
 * @dev Trust configuration lives entirely here, keeping the upgradeable SafetyNet core minimal. A
 *      single FluClaimV2 Groth16 verifier (the circuit is provider-agnostic — the sender domain is
 *      checked on-chain, not baked in) is paired with:
 *      - `providerEnabled`: owner-curated healthcare sender domains (senders of diagnosis email A).
 *      - `bindingProviderEnabled`: owner-curated consumer email-provider domains (signers of the
 *        member's binding email B — gmail.com, outlook.com, …). This registry is what stops a forged
 *        binding email: an attacker signing a `From:` of "victim(at)gmail.com" with a domain they control has a
 *        DKIM key that isn't gmail's, so the DKIM lookup under gmail.com fails.
 *      - The DKIM key-hash registry (seeded from the ZK Email DKIM archive), checked for BOTH emails.
 *      Per claim: Groth16 proof, both DKIM keys registered under their claimed domains, both domains
 *      enabled, wallet proven in B's subject matches the claimant (anti-front-running), one claim per
 *      diagnosis email ever (header-hash nullifier), and a per-(net, member) cooldown.
 *
 *      SIGNAL LAYOUT IS LOAD-BEARING — see {IZkEmailFluVerifier} and circuits/src/flu_claim_v2.circom.
 * @author @RonTuretzky
 */
contract ZkEmailFluVerifier is IZkEmailFluVerifier, Ownable {
  /// @notice Byte length of a claimant address rendered as a lowercase 0x-prefixed hex string
  uint256 internal constant _CLAIMANT_HEX_LENGTH = 42;

  /// @notice Bytes packed per field element in ZK Email reveals
  uint256 internal constant _PACK_SIZE = 31;

  /// @inheritdoc IZkEmailFluVerifier
  address public immutable SAFETY_NET;

  /// @inheritdoc IZkEmailFluVerifier
  address public immutable GROTH16_VERIFIER;

  /// @inheritdoc IZkEmailFluVerifier
  address public immutable DKIM_REGISTRY;

  /// @inheritdoc IZkEmailFluVerifier
  mapping(bytes32 domainHash => bool enabled) public providerEnabled;

  /// @inheritdoc IZkEmailFluVerifier
  mapping(bytes32 domainHash => bool enabled) public bindingProviderEnabled;

  /// @inheritdoc IZkEmailFluVerifier
  mapping(bytes32 nullifier => bool used) public usedNullifiers;

  /// @inheritdoc IZkEmailFluVerifier
  mapping(uint256 safetyNetId => mapping(address member => uint256 claimedAt)) public lastFluClaimAt;

  /// @inheritdoc IZkEmailFluVerifier
  /// @dev Default 90 days: one payout per member per net per flu season, since a single illness can
  ///      generate multiple provable diagnosis emails (result + prescription + billing)
  uint256 public claimCooldown = 90 days;

  /**
   * @notice Constructor
   * @param _owner The owner curating providers and parameters (SafetyNet admin multisig)
   * @param _safetyNet The SafetyNet proxy allowed to call {verifyFluClaim}
   * @param _groth16Verifier The single FluClaimV2 Groth16 verifier
   * @param _dkimRegistry The DKIM public-key-hash registry (ZK Email DKIMRegistry)
   */
  constructor(address _owner, address _safetyNet, address _groth16Verifier, address _dkimRegistry) Ownable(_owner) {
    if (_safetyNet == address(0) || _groth16Verifier == address(0) || _dkimRegistry == address(0)) revert InvalidAddressZero();
    SAFETY_NET = _safetyNet;
    GROTH16_VERIFIER = _groth16Verifier;
    DKIM_REGISTRY = _dkimRegistry;
  }

  /// @inheritdoc IZkEmailFluVerifier
  function verifyFluClaim(uint256 _safetyNetId, address _claimant, bytes calldata _proof) external override returns (bytes32 _nullifier) {
    if (msg.sender != SAFETY_NET) revert OnlySafetyNet();

    FluClaimProof memory _claim = abi.decode(_proof, (FluClaimProof));

    bytes32 _providerHash = keccak256(bytes(_claim.providerDomain));
    if (!providerEnabled[_providerHash]) revert UnknownProvider();
    if (!bindingProviderEnabled[keccak256(bytes(_claim.bindingDomain))]) revert UnknownBindingProvider();

    // One payout per illness: the circuit exposes no DKIM timestamp, so rate-limit instead
    uint256 _lastClaim = lastFluClaimAt[_safetyNetId][_claimant];
    if (_lastClaim != 0 && block.timestamp < _lastClaim + claimCooldown) revert FluClaimCooldownActive();

    // Anti-front-running: the wallet proven inside email B's subject must be the claimant. A proof
    // observed in the mempool only ever benefits the wallet baked into it
    (uint256 _packedLo, uint256 _packedHi) = _packedClaimantAddress(_claimant);
    if (_claim.signals[4] != _packedLo || _claim.signals[5] != _packedHi) revert ClaimantMismatch();

    // Diagnosis email A: its DKIM key must be a registered key of the claimed healthcare domain
    if (!IDKIMRegistry(DKIM_REGISTRY).isDKIMPublicKeyHashValid(_claim.providerDomain, bytes32(_claim.signals[0]))) {
      revert InvalidDkimKeyHash();
    }
    // Binding email B: its DKIM key must be a registered key of the claimed email-provider domain.
    // This is what makes B unforgeable — only the real provider (gmail) holds that key
    if (!IDKIMRegistry(DKIM_REGISTRY).isDKIMPublicKeyHashValid(_claim.bindingDomain, bytes32(_claim.signals[1]))) {
      revert InvalidBindingDkimKeyHash();
    }

    if (!IGroth16Verifier(GROTH16_VERIFIER).verifyProof(_claim.a, _claim.b, _claim.c, _claim.signals)) {
      revert InvalidProof();
    }

    // One claim per diagnosis email ever: the SHA-256 hash of A's signed header identifies it
    _nullifier = keccak256(abi.encodePacked(_claim.signals[2], _claim.signals[3]));
    if (usedNullifiers[_nullifier]) revert EmailAlreadyUsed();
    usedNullifiers[_nullifier] = true;

    lastFluClaimAt[_safetyNetId][_claimant] = block.timestamp;

    emit FluClaimVerified(_safetyNetId, _claimant, _providerHash, _nullifier);
  }

  /// @inheritdoc IZkEmailFluVerifier
  function setProvider(string calldata _domain, bool _enabled) external override onlyOwner {
    bytes32 _domainHash = keccak256(bytes(_domain));
    providerEnabled[_domainHash] = _enabled;
    emit ProviderSet(_domainHash, _domain, _enabled);
  }

  /// @inheritdoc IZkEmailFluVerifier
  function setBindingProvider(string calldata _domain, bool _enabled) external override onlyOwner {
    bytes32 _domainHash = keccak256(bytes(_domain));
    bindingProviderEnabled[_domainHash] = _enabled;
    emit BindingProviderSet(_domainHash, _domain, _enabled);
  }

  /// @inheritdoc IZkEmailFluVerifier
  function setClaimCooldown(uint256 _claimCooldown) external override onlyOwner {
    claimCooldown = _claimCooldown;
    emit ClaimCooldownSet(_claimCooldown);
  }

  /**
   * @notice Packs a claimant address into the circuit's wallet representation
   * @dev Mirrors ZK Email's PackBytes and the wallet the circuit reveals from email B's subject: the
   *      address rendered as a lowercase 0x-prefixed hex string (42 ASCII bytes), packed 31 bytes per
   *      field element, little-endian within each field. The member therefore sets B's subject to
   *      their address LOWERCASED
   * @param _claimant The claimant address
   * @return _lo The first field element (hex-string bytes 0..30)
   * @return _hi The second field element (hex-string bytes 31..41)
   */
  function _packedClaimantAddress(address _claimant) internal pure returns (uint256 _lo, uint256 _hi) {
    bytes memory _hex = bytes(Strings.toHexString(_claimant));

    for (uint256 i = 0; i < _PACK_SIZE; i++) {
      _lo |= uint256(uint8(_hex[i])) << (8 * i);
    }
    for (uint256 i = _PACK_SIZE; i < _CLAIMANT_HEX_LENGTH; i++) {
      _hi |= uint256(uint8(_hex[i])) << (8 * (i - _PACK_SIZE));
    }
  }
}
