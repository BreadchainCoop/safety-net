// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ZK Email Flu Claim Verifier Interface
/// @notice Verifies ZK Email proofs that a Safety Net member received a DKIM-signed email from an
///         allowlisted US healthcare sender whose content matched the flu-diagnosis pattern
///         (the word "influenza", an ICD-10 influenza code J09/J10/J11, or a flu-specific
///         antiviral prescription — never the bare word "flu"), enabling instant claim settlement
///         with no contest/voting phase.
/// @dev Built on the ZK Email circom/Groth16 blueprint stack. One Groth16 verifier is deployed per
///      healthcare sender domain (a blueprint binds exactly one DKIM `d=` domain); all share the
///      canonical public-signal layout below, which REQUIRES the blueprint to be compiled with
///      header/body masking disabled:
///        [0] pubkeyHash          Poseidon hash of the sender's DKIM RSA public key
///        [1] headerHashHi        SHA-256 hash of the signed email header (high 128 bits)
///        [2] headerHashLo        SHA-256 hash of the signed email header (low 128 bits)
///        [3] toAddressHash       Poseidon hash of the To: recipient address (isHashed reveal)
///        [4] proverEthAddress    Built-in blueprint input; unconstrained and unused (SDK sets 0)
///        [5] claimantAddress[0]  External input: claimant address as a lowercase hex string,
///        [6] claimantAddress[1]  zero-padded to 42 bytes and packed 31 bytes per field, little-endian
///      The flu-diagnosis regex itself is enforced in-circuit and kept private — a valid proof from a
///      domain's verifier attests the match without revealing which term matched.
///      Full blueprint spec, provider list, and threat model: docs/zk-email-flu-claims.md.
/// @author @RonTuretzky
interface IZkEmailFluVerifier {
  /*///////////////////////////////////////////////////////////////
                            STRUCTS
  //////////////////////////////////////////////////////////////*/

  /// @notice A ZK Email flu claim proof, ABI-encoded into the opaque bytes SafetyNet passes through
  /// @param domain The DKIM `d=` domain of the sending healthcare provider (e.g. "kp.org"); must be
  ///        a registered, enabled provider. The DKIM registry lookup uses this exact string
  /// @param a The Groth16 proof A point
  /// @param b The Groth16 proof B point
  /// @param c The Groth16 proof C point
  /// @param signals The circuit public signals in the canonical flu blueprint layout (see interface dev docs)
  struct FluClaimProof {
    string domain;
    uint256[2] a;
    uint256[2][2] b;
    uint256[2] c;
    uint256[7] signals;
  }

  /// @notice Configuration of an allowlisted healthcare sender domain
  /// @param groth16Verifier The Groth16 verifier deployed from the domain's compiled flu blueprint
  /// @param enabled Whether claims from this domain are currently accepted
  struct Provider {
    address groth16Verifier;
    bool enabled;
  }

  /*///////////////////////////////////////////////////////////////
                            EVENTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Emitted when a provider domain is registered, updated, or disabled
  /// @param domainHash keccak256 of the domain string (mapping key)
  /// @param domain The DKIM `d=` domain
  /// @param groth16Verifier The domain's Groth16 verifier contract
  /// @param enabled Whether claims from this domain are accepted
  event ProviderSet(bytes32 indexed domainHash, string domain, address groth16Verifier, bool enabled);

  /// @notice Emitted when a member registers the Poseidon commitment of their email address
  /// @param member The member address
  /// @param commitment Poseidon hash of the member's (lowercase) email address, as produced by the
  ///        circuit's isHashed To: reveal
  event EmailCommitmentRegistered(address indexed member, bytes32 commitment);

  /// @notice Emitted when the owner clears a member's email commitment (squatting recovery)
  /// @param member The member whose commitment was cleared
  /// @param commitment The cleared commitment
  event EmailCommitmentCleared(address indexed member, bytes32 commitment);

  /// @notice Emitted when the owner updates the per-member per-net claim cooldown
  /// @param claimCooldown The new cooldown in seconds
  event ClaimCooldownSet(uint256 claimCooldown);

  /// @notice Emitted when the owner updates the email-commitment waiting period
  /// @param commitmentDelay The new waiting period in seconds
  event CommitmentDelaySet(uint256 commitmentDelay);

  /// @notice Emitted when a flu claim proof is successfully verified
  /// @param safetyNetId The Safety Net the claim settles against
  /// @param claimant The member the payout is bound to
  /// @param domainHash keccak256 of the sender domain the email was proven from
  /// @param nullifier The consumed email nullifier (keccak256 of the signed header hash)
  event FluClaimVerified(uint256 indexed safetyNetId, address indexed claimant, bytes32 indexed domainHash, bytes32 nullifier);

  /*///////////////////////////////////////////////////////////////
                            ERRORS
  //////////////////////////////////////////////////////////////*/

  /// @notice Thrown when a constructor address argument is zero
  error InvalidAddressZero();

  /// @notice Thrown when verifyFluClaim is called by any address other than the SafetyNet proxy
  error OnlySafetyNet();

  /// @notice Thrown when enabling a provider with a zero Groth16 verifier address
  error InvalidGroth16Verifier();

  /// @notice Thrown when the proof's domain is not a registered, enabled provider
  error UnknownProvider();

  /// @notice Thrown when the claimant has not registered an email commitment
  error EmailCommitmentNotSet();

  /// @notice Thrown when the claimant's email commitment is younger than the waiting period
  error EmailCommitmentTooRecent();

  /// @notice Thrown when registering a zero email commitment
  error InvalidCommitment();

  /// @notice Thrown when registering an email commitment already held by another address
  /// @dev First-come uniqueness: a copied commitment value is worthless, defeating the
  ///      copy-at-join-time bypass of the waiting period. Squatted commitments are recoverable
  ///      via the owner's {clearEmailCommitment}
  error CommitmentAlreadyRegistered();

  /// @notice Thrown when the claimant already settled a flu claim within the cooldown window
  error FluClaimCooldownActive();

  /// @notice Thrown when the proof's DKIM public key hash is not registered for the domain
  error InvalidDkimKeyHash();

  /// @notice Thrown when the proof's claimant-address external input does not match the claimant
  error ClaimantMismatch();

  /// @notice Thrown when the proof's To:-address hash does not match the claimant's email commitment
  error RecipientMismatch();

  /// @notice Thrown when the Groth16 proof fails verification
  error InvalidProof();

  /// @notice Thrown when the email's nullifier has already been consumed by a previous claim
  error EmailAlreadyUsed();

  /*///////////////////////////////////////////////////////////////
                            EXTERNAL
  //////////////////////////////////////////////////////////////*/

  /// @notice Verifies a flu claim proof for a claimant, consuming the email's nullifier
  /// @dev Only callable by the SafetyNet proxy (state-changing: nullifier + cooldown). Reverts on any
  ///      failed check; returns the consumed nullifier on success
  /// @param safetyNetId The Safety Net the claim settles against (scopes the claim cooldown)
  /// @param claimant The member claiming; must match the address bound inside the proof
  /// @param proof ABI-encoded {FluClaimProof}
  /// @return nullifier The consumed email nullifier
  function verifyFluClaim(uint256 safetyNetId, address claimant, bytes calldata proof) external returns (bytes32 nullifier);

  /// @notice Registers or updates the caller's email commitment
  /// @dev The commitment is the Poseidon hash of the caller's email address exactly as the circuit's
  ///      isHashed To: reveal computes it (lowercase, packed). Each commitment value can be held by
  ///      only one address (first-come; see {CommitmentAlreadyRegistered}), and claims are only
  ///      accepted once the commitment has aged past the waiting period — together the anti-theft
  ///      measures for leaked/bought .eml files
  /// @param commitment Poseidon hash of the caller's email address
  function registerEmailCommitment(bytes32 commitment) external;

  /// @notice Clears a member's email commitment, freeing its value for re-registration
  /// @dev Owner-only recovery path for squatted commitments (an attacker front-running a member's
  ///      registration to hold their commitment hostage). Clearing forces the member to re-register
  ///      and sit out the waiting period again
  /// @param member The member whose commitment is cleared
  function clearEmailCommitment(address member) external;

  /// @notice Registers, updates, or disables a healthcare provider domain
  /// @param domain The DKIM `d=` domain (exact string used in DKIM registry lookups; subdomains distinct)
  /// @param groth16Verifier The Groth16 verifier compiled from the domain's flu blueprint
  /// @param enabled Whether claims from this domain are accepted
  function setProvider(string calldata domain, address groth16Verifier, bool enabled) external;

  /// @notice Updates the per-member per-net claim cooldown
  /// @param claimCooldown The new cooldown in seconds
  function setClaimCooldown(uint256 claimCooldown) external;

  /// @notice Updates the email-commitment waiting period
  /// @param commitmentDelay The new waiting period in seconds
  function setCommitmentDelay(uint256 commitmentDelay) external;

  /*///////////////////////////////////////////////////////////////
                            VIEW
  //////////////////////////////////////////////////////////////*/

  /// @notice Returns a provider's configuration
  /// @param domainHash keccak256 of the domain string
  /// @return groth16Verifier The domain's Groth16 verifier
  /// @return enabled Whether claims from this domain are accepted
  function providers(bytes32 domainHash) external view returns (address groth16Verifier, bool enabled);

  /// @notice Returns whether an email nullifier has been consumed
  /// @param nullifier The email nullifier
  /// @return used True when the nullifier has been consumed
  function usedNullifiers(bytes32 nullifier) external view returns (bool used);

  /// @notice Returns a member's registered email commitment (zero when unset)
  /// @param member The member address
  /// @return commitment The registered commitment
  function emailCommitments(address member) external view returns (bytes32 commitment);

  /// @notice Returns the address holding a commitment value (zero when unheld)
  /// @param commitment The commitment value
  /// @return holder The holding address
  function commitmentHolders(bytes32 commitment) external view returns (address holder);

  /// @notice Returns when a member last set their email commitment
  /// @param member The member address
  /// @return setAt The registration timestamp (zero when unset)
  function emailCommitmentSetAt(address member) external view returns (uint256 setAt);

  /// @notice Returns when a member last settled a flu claim on a Safety Net
  /// @param safetyNetId The Safety Net ID
  /// @param member The member address
  /// @return claimedAt The last claim timestamp (zero when never claimed)
  function lastFluClaimAt(uint256 safetyNetId, address member) external view returns (uint256 claimedAt);

  /// @notice The per-member per-net claim cooldown in seconds
  /// @return cooldown The cooldown in seconds
  function claimCooldown() external view returns (uint256 cooldown);

  /// @notice The email-commitment waiting period in seconds
  /// @return delay The waiting period in seconds
  function commitmentDelay() external view returns (uint256 delay);
}
