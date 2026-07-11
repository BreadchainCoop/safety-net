// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ZK Email Flu Claim Verifier Interface
/// @notice Verifies ZK Email proofs that a Safety Net member (a) received a DKIM-signed email from an
///         allowlisted US healthcare sender whose content matched the flu-diagnosis pattern, and
///         (b) controls the inbox that email was sent to — binding the payout to their wallet — all
///         without revealing the email address on-chain, and with no pre-registration.
/// @dev Built on a single self-hosted FluClaimV2 circom/Groth16 circuit that verifies TWO DKIM-signed
///      emails together:
///        A (flu diagnosis): provider -> member, full body, matches the flu pattern.
///        B (binding):       member -> anywhere, header-only, `From:` = the member, `Subject:` = the
///                           claimant's lowercase 0x wallet address.
///      The circuit asserts `To(A) == From(B)` privately (proving the same inbox received A and signed
///      B) and reveals the wallet from B's subject. Because DKIM signs outbound mail, only the inbox
///      owner can produce B — so possession of a leaked A alone is useless. Soundness against a
///      forged B comes from checking B's DKIM key against an owner-curated registry of real consumer
///      email-provider keys (gmail/outlook/…): an attacker signing a `From:` of "victim(at)gmail.com" with a
///      domain they control fails that lookup.
///
///      Canonical public-signal layout (6 signals — must match circuits/src/flu_claim_v2.circom):
///        [0] pubkeyHashA     provider DKIM key      (checked vs the healthcare provider allowlist)
///        [1] pubkeyHashB     member-provider key    (checked vs the binding-provider allowlist)
///        [2] headerHashHiA   SHA-256 of A's header  (nullifier material)
///        [3] headerHashLoA
///        [4] walletPacked0   claimant wallet as a lowercase 0x hex string (42 bytes), 31-byte LE
///        [5] walletPacked1   packed — compared on-chain against the claimant
///
///      No email address (or hash of one) is ever published. Full spec: docs/zk-email-flu-claims.md.
/// @author @RonTuretzky
interface IZkEmailFluVerifier {
  /*///////////////////////////////////////////////////////////////
                            STRUCTS
  //////////////////////////////////////////////////////////////*/

  /// @notice A ZK Email flu claim proof, ABI-encoded into the opaque bytes SafetyNet passes through
  /// @param providerDomain The DKIM `d=` domain of the healthcare sender of email A (e.g. "kp.org");
  ///        must be an enabled provider. The DKIM registry lookup uses this exact string
  /// @param bindingDomain The DKIM `d=` domain of the member's email provider that signed email B
  ///        (e.g. "gmail.com"); must be an enabled binding provider
  /// @param a The Groth16 proof A point
  /// @param b The Groth16 proof B point
  /// @param c The Groth16 proof C point
  /// @param signals The circuit public signals in the canonical layout (see interface dev docs)
  struct FluClaimProof {
    string providerDomain;
    string bindingDomain;
    uint256[2] a;
    uint256[2][2] b;
    uint256[2] c;
    uint256[6] signals;
  }

  /*///////////////////////////////////////////////////////////////
                            EVENTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Emitted when a healthcare provider domain is enabled or disabled
  /// @param domainHash keccak256 of the domain string (mapping key)
  /// @param domain The DKIM `d=` domain
  /// @param enabled Whether flu-diagnosis emails from this domain are accepted
  event ProviderSet(bytes32 indexed domainHash, string domain, bool enabled);

  /// @notice Emitted when a binding email-provider domain is enabled or disabled
  /// @param domainHash keccak256 of the domain string (mapping key)
  /// @param domain The DKIM `d=` domain (e.g. "gmail.com")
  /// @param enabled Whether binding emails signed by this domain are accepted
  event BindingProviderSet(bytes32 indexed domainHash, string domain, bool enabled);

  /// @notice Emitted when the owner updates the per-member per-net claim cooldown
  /// @param claimCooldown The new cooldown in seconds
  event ClaimCooldownSet(uint256 claimCooldown);

  /// @notice Emitted when a flu claim proof is successfully verified
  /// @param safetyNetId The Safety Net the claim settles against
  /// @param claimant The member the payout is bound to
  /// @param providerHash keccak256 of the healthcare sender domain the diagnosis was proven from
  /// @param nullifier The consumed email nullifier (keccak256 of the diagnosis email's header hash)
  event FluClaimVerified(uint256 indexed safetyNetId, address indexed claimant, bytes32 indexed providerHash, bytes32 nullifier);

  /*///////////////////////////////////////////////////////////////
                            ERRORS
  //////////////////////////////////////////////////////////////*/

  /// @notice Thrown when a constructor address argument is zero
  error InvalidAddressZero();

  /// @notice Thrown when verifyFluClaim is called by any address other than the SafetyNet proxy
  error OnlySafetyNet();

  /// @notice Thrown when the proof's provider domain is not an enabled healthcare sender
  error UnknownProvider();

  /// @notice Thrown when the proof's binding domain is not an enabled email provider
  error UnknownBindingProvider();

  /// @notice Thrown when the claimant already settled a flu claim within the cooldown window
  error FluClaimCooldownActive();

  /// @notice Thrown when the wallet proven inside email B's subject does not match the claimant
  error ClaimantMismatch();

  /// @notice Thrown when the diagnosis email's DKIM key is not registered for the provider domain
  error InvalidDkimKeyHash();

  /// @notice Thrown when the binding email's DKIM key is not registered for the binding domain
  error InvalidBindingDkimKeyHash();

  /// @notice Thrown when the Groth16 proof fails verification
  error InvalidProof();

  /// @notice Thrown when the diagnosis email's nullifier has already been consumed
  error EmailAlreadyUsed();

  /*///////////////////////////////////////////////////////////////
                            EXTERNAL
  //////////////////////////////////////////////////////////////*/

  /// @notice Verifies a flu claim proof for a claimant, consuming the diagnosis email's nullifier
  /// @dev Only callable by the SafetyNet proxy (state-changing: nullifier + cooldown). Reverts on any
  ///      failed check; returns the consumed nullifier on success
  /// @param safetyNetId The Safety Net the claim settles against (scopes the claim cooldown)
  /// @param claimant The member claiming; must match the wallet proven inside email B
  /// @param proof ABI-encoded {FluClaimProof}
  /// @return nullifier The consumed email nullifier
  function verifyFluClaim(uint256 safetyNetId, address claimant, bytes calldata proof) external returns (bytes32 nullifier);

  /// @notice Enables or disables a healthcare provider domain (sender of diagnosis emails)
  /// @param domain The DKIM `d=` domain (exact string used in DKIM registry lookups; subdomains distinct)
  /// @param enabled Whether diagnosis emails from this domain are accepted
  function setProvider(string calldata domain, bool enabled) external;

  /// @notice Enables or disables a binding email-provider domain (signer of the member's binding email)
  /// @param domain The DKIM `d=` domain (e.g. "gmail.com")
  /// @param enabled Whether binding emails signed by this domain are accepted
  function setBindingProvider(string calldata domain, bool enabled) external;

  /// @notice Updates the per-member per-net claim cooldown
  /// @param claimCooldown The new cooldown in seconds
  function setClaimCooldown(uint256 claimCooldown) external;

  /*///////////////////////////////////////////////////////////////
                            VIEW
  //////////////////////////////////////////////////////////////*/

  /// @notice The SafetyNet proxy allowed to call verifyFluClaim
  /// @return safetyNet The SafetyNet proxy address
  // solhint-disable-next-line func-name-mixedcase
  function SAFETY_NET() external view returns (address safetyNet);

  /// @notice The single FluClaimV2 Groth16 verifier
  /// @return groth16 The Groth16 verifier address
  // solhint-disable-next-line func-name-mixedcase
  function GROTH16_VERIFIER() external view returns (address groth16);

  /// @notice The DKIM public-key-hash registry consulted per claim
  /// @return dkimRegistry The DKIM registry address
  // solhint-disable-next-line func-name-mixedcase
  function DKIM_REGISTRY() external view returns (address dkimRegistry);

  /// @notice Returns whether a healthcare provider domain is enabled
  /// @param domainHash keccak256 of the domain string
  /// @return enabled True when diagnosis emails from this domain are accepted
  function providerEnabled(bytes32 domainHash) external view returns (bool enabled);

  /// @notice Returns whether a binding email-provider domain is enabled
  /// @param domainHash keccak256 of the domain string
  /// @return enabled True when binding emails signed by this domain are accepted
  function bindingProviderEnabled(bytes32 domainHash) external view returns (bool enabled);

  /// @notice Returns whether an email nullifier has been consumed
  /// @param nullifier The email nullifier
  /// @return used True when the nullifier has been consumed
  function usedNullifiers(bytes32 nullifier) external view returns (bool used);

  /// @notice Returns when a member last settled a flu claim on a Safety Net
  /// @param safetyNetId The Safety Net ID
  /// @param member The member address
  /// @return claimedAt The last claim timestamp (zero when never claimed)
  function lastFluClaimAt(uint256 safetyNetId, address member) external view returns (uint256 claimedAt);

  /// @notice The per-member per-net claim cooldown in seconds
  /// @return cooldown The cooldown in seconds
  function claimCooldown() external view returns (uint256 cooldown);
}
