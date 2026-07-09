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
 *         phase — against a ZK Email proof: the member proves possession of a DKIM-signed email from
 *         an allowlisted US healthcare sender whose content matched the in-circuit flu-diagnosis
 *         pattern, without revealing the email itself.
 * @dev Trust configuration lives entirely here, keeping the upgradeable SafetyNet core minimal:
 *      - The "verified doctor list" is the owner-curated (domain -> Groth16 verifier) provider
 *        registry (one ZK Email blueprint, and thus one verifier, per DKIM `d=` domain) plus the
 *        owner-operated DKIM key-hash registry (seeded from the ZK Email DKIM archive,
 *        https://archive.prove.email — 2048-bit selectors only; see docs/zk-email-flu-claims.md).
 *      - Soundness checks per claim: Groth16 proof, DKIM key hash registered for the domain, domain
 *        enabled, claimant address bound in-proof (anti-front-running), To:-address Poseidon hash
 *        matching the claimant's pre-registered email commitment aged past the waiting period
 *        (anti-theft for leaked .eml files), one claim per email ever (header-hash nullifier), and
 *        a per-member per-net cooldown (one payout per illness; the stock blueprint circuit exposes
 *        no DKIM timestamp, so freshness is rate-limited rather than proven).
 *      - SIGNAL LAYOUT IS LOAD-BEARING: the canonical layout documented in {IZkEmailFluVerifier}
 *        assumes blueprint masking is disabled. Validate every provider's verifier against a real
 *        proof's publicOutputs before enabling it.
 * @author @RonTuretzky
 */
contract ZkEmailFluVerifier is IZkEmailFluVerifier, Ownable {
  /// @notice Byte length of a claimant address rendered as a lowercase 0x-prefixed hex string
  uint256 internal constant _CLAIMANT_HEX_LENGTH = 42;

  /// @notice Bytes packed per field element in ZK Email reveals and external inputs
  uint256 internal constant _PACK_SIZE = 31;

  /// @notice The SafetyNet proxy allowed to call {verifyFluClaim}
  address public immutable SAFETY_NET;

  /// @notice The DKIM public-key-hash registry consulted per claim
  address public immutable DKIM_REGISTRY;

  /// @inheritdoc IZkEmailFluVerifier
  mapping(bytes32 domainHash => Provider provider) public providers;

  /// @inheritdoc IZkEmailFluVerifier
  mapping(bytes32 nullifier => bool used) public usedNullifiers;

  /// @inheritdoc IZkEmailFluVerifier
  mapping(address member => bytes32 commitment) public emailCommitments;

  /// @inheritdoc IZkEmailFluVerifier
  mapping(bytes32 commitment => address holder) public commitmentHolders;

  /// @inheritdoc IZkEmailFluVerifier
  mapping(address member => uint256 setAt) public emailCommitmentSetAt;

  /// @inheritdoc IZkEmailFluVerifier
  mapping(uint256 safetyNetId => mapping(address member => uint256 claimedAt)) public lastFluClaimAt;

  /// @inheritdoc IZkEmailFluVerifier
  /// @dev Default 90 days: one payout per member per net per flu season, since a single illness can
  ///      generate multiple provable emails (result + prescription + billing)
  uint256 public claimCooldown = 90 days;

  /// @inheritdoc IZkEmailFluVerifier
  /// @dev Default 7 days: a freshly (re)bound email commitment cannot claim immediately. Only
  ///      meaningful together with the first-come commitment uniqueness — the delay stops post-leak
  ///      rebinding, uniqueness stops pre-emptive copying of another member's registered commitment
  uint256 public commitmentDelay = 7 days;

  /**
   * @notice Constructor
   * @param _owner The owner curating providers and parameters (SafetyNet admin multisig)
   * @param _safetyNet The SafetyNet proxy allowed to call {verifyFluClaim}
   * @param _dkimRegistry The DKIM public-key-hash registry (ZK Email DKIMRegistry)
   */
  constructor(address _owner, address _safetyNet, address _dkimRegistry) Ownable(_owner) {
    if (_safetyNet == address(0) || _dkimRegistry == address(0)) revert InvalidAddressZero();
    SAFETY_NET = _safetyNet;
    DKIM_REGISTRY = _dkimRegistry;
  }

  /// @inheritdoc IZkEmailFluVerifier
  function verifyFluClaim(uint256 _safetyNetId, address _claimant, bytes calldata _proof) external override returns (bytes32 _nullifier) {
    if (msg.sender != SAFETY_NET) revert OnlySafetyNet();

    FluClaimProof memory _claim = abi.decode(_proof, (FluClaimProof));

    bytes32 _domainHash = keccak256(bytes(_claim.domain));
    Provider memory _provider = providers[_domainHash];
    if (!_provider.enabled) revert UnknownProvider();

    // Anti-theft binding: the To: address proven in-circuit must match a commitment the member
    // registered at least `commitmentDelay` ago (external inputs alone are unconstrained
    // pass-throughs, so without this any leaked .eml would be claimable by whoever holds it)
    bytes32 _commitment = emailCommitments[_claimant];
    if (_commitment == bytes32(0)) revert EmailCommitmentNotSet();
    if (block.timestamp < emailCommitmentSetAt[_claimant] + commitmentDelay) revert EmailCommitmentTooRecent();
    if (bytes32(_claim.signals[3]) != _commitment) revert RecipientMismatch();

    // One payout per illness: the stock blueprint circuit exposes no DKIM timestamp, so email
    // freshness cannot be proven — rate-limit instead
    uint256 _lastClaim = lastFluClaimAt[_safetyNetId][_claimant];
    if (_lastClaim != 0 && block.timestamp < _lastClaim + claimCooldown) revert FluClaimCooldownActive();

    // Anti-front-running binding: the claimant address is baked into the proof as an external input
    (uint256 _packedLo, uint256 _packedHi) = _packedClaimantAddress(_claimant);
    if (_claim.signals[5] != _packedLo || _claim.signals[6] != _packedHi) revert ClaimantMismatch();

    // The DKIM key that signed the email must be a registered key of the claimed domain
    if (!IDKIMRegistry(DKIM_REGISTRY).isDKIMPublicKeyHashValid(_claim.domain, bytes32(_claim.signals[0]))) {
      revert InvalidDkimKeyHash();
    }

    if (!IGroth16Verifier(_provider.groth16Verifier).verifyProof(_claim.a, _claim.b, _claim.c, _claim.signals)) {
      revert InvalidProof();
    }

    // One claim per email ever: the SHA-256 hash of the DKIM-signed header identifies the email
    _nullifier = keccak256(abi.encodePacked(_claim.signals[1], _claim.signals[2]));
    if (usedNullifiers[_nullifier]) revert EmailAlreadyUsed();
    usedNullifiers[_nullifier] = true;

    lastFluClaimAt[_safetyNetId][_claimant] = block.timestamp;

    emit FluClaimVerified(_safetyNetId, _claimant, _domainHash, _nullifier);
  }

  /// @inheritdoc IZkEmailFluVerifier
  function registerEmailCommitment(bytes32 _commitment) external override {
    if (_commitment == bytes32(0)) revert InvalidCommitment();

    address _holder = commitmentHolders[_commitment];
    if (_holder != address(0) && _holder != msg.sender) revert CommitmentAlreadyRegistered();

    // Re-registration frees the caller's previous commitment value
    bytes32 _previous = emailCommitments[msg.sender];
    if (_previous != bytes32(0)) {
      delete commitmentHolders[_previous];
    }

    commitmentHolders[_commitment] = msg.sender;
    emailCommitments[msg.sender] = _commitment;
    emailCommitmentSetAt[msg.sender] = block.timestamp;

    emit EmailCommitmentRegistered(msg.sender, _commitment);
  }

  /// @inheritdoc IZkEmailFluVerifier
  function clearEmailCommitment(address _member) external override onlyOwner {
    bytes32 _commitment = emailCommitments[_member];

    delete commitmentHolders[_commitment];
    delete emailCommitments[_member];
    delete emailCommitmentSetAt[_member];

    emit EmailCommitmentCleared(_member, _commitment);
  }

  /// @inheritdoc IZkEmailFluVerifier
  function setProvider(string calldata _domain, address _groth16Verifier, bool _enabled) external override onlyOwner {
    if (_enabled && _groth16Verifier == address(0)) revert InvalidGroth16Verifier();

    bytes32 _domainHash = keccak256(bytes(_domain));
    providers[_domainHash] = Provider({groth16Verifier: _groth16Verifier, enabled: _enabled});

    emit ProviderSet(_domainHash, _domain, _groth16Verifier, _enabled);
  }

  /// @inheritdoc IZkEmailFluVerifier
  function setClaimCooldown(uint256 _claimCooldown) external override onlyOwner {
    claimCooldown = _claimCooldown;
    emit ClaimCooldownSet(_claimCooldown);
  }

  /// @inheritdoc IZkEmailFluVerifier
  function setCommitmentDelay(uint256 _commitmentDelay) external override onlyOwner {
    commitmentDelay = _commitmentDelay;
    emit CommitmentDelaySet(_commitmentDelay);
  }

  /**
   * @notice Packs a claimant address into the circuit's external-input representation
   * @dev Mirrors ZK Email's PackBytes: the address rendered as a lowercase 0x-prefixed hex string
   *      (42 ASCII bytes), zero-padded to the external input's maxLength (42) and packed 31 bytes
   *      per field element, little-endian within each field. The prover must therefore pass the
   *      claimant address LOWERCASED to the SDK
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
