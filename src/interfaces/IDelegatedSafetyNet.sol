// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Extra SafetyNet public getters used by the delegated deposits extension
/// @notice Re-declares SafetyNet public state getters that exist on the concrete contract but are
///         not part of {ISafetyNet}. The extension reads them without modifying the main interface.
/// @author @RonTuretzky
interface ISafetyNetExtra {
  /// @notice The next Safety Net ID to be assigned (also the count of created Safety Nets)
  /// @return id The next Safety Net ID
  function nextId() external view returns (uint256 id);

  /// @notice Whether an address is a member of a Safety Net
  /// @param id The Safety Net ID
  /// @param member The address to check
  /// @return status True if the address is a member of the Safety Net
  function isMember(uint256 id, address member) external view returns (bool status);

  /// @notice The stored monthly contribution for a member; 0 until the member's onboarding deposit
  /// @param id The Safety Net ID
  /// @param member The member address
  /// @return monthlyContribute The member's monthly contribution amount, 0 before onboarding
  function safetyNetMemberContribute(uint256 id, address member) external view returns (uint256 monthlyContribute);
}

/// @title IDelegatedSafetyNet
/// @notice Interface for the SafetyNet delegated deposits extension contract
/// @dev This extension enables delegated ERC20 allowance-based deposits and batch operations. Members
///      opt in here and approve the MAIN SafetyNet proxy (not this extension); a keeper then triggers
///      their owed deposit through {depositIfAllowed} / {batchDepositIfAllowed}.
/// @author @RonTuretzky
interface IDelegatedSafetyNet {
  /*///////////////////////////////////////////////////////////////
                            EVENTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Emitted when a member enables or disables delegated deposits
  /// @param member The address of the member
  /// @param enabled Whether delegated deposits are enabled
  event DelegatedDepositsToggled(address indexed member, bool indexed enabled);

  /*///////////////////////////////////////////////////////////////
                            ERRORS
  //////////////////////////////////////////////////////////////*/

  /// @notice Thrown when a member has insufficient allowance on the main SafetyNet proxy for the deposit
  error InsufficientAllowance();

  /// @notice Thrown when array lengths don't match in batch operations
  error ArrayLengthMismatch();

  /// @notice Thrown when delegated deposits are not enabled for a member
  error DelegatedDepositsNotEnabled();

  /*///////////////////////////////////////////////////////////////
                            EXTERNAL
  //////////////////////////////////////////////////////////////*/

  /// @notice Enable or disable delegated deposits for the caller
  /// @param enabled Whether to enable delegated deposits
  function setDelegatedDepositsEnabled(bool enabled) external;

  /// @notice Deposit the amount a member owes for a Safety Net if they opted in and approved the proxy
  /// @dev The member must have opted in here and approved the MAIN SafetyNet proxy for the owed amount.
  ///      The owed amount is the exact `initialDeposit` for an un-onboarded member, otherwise the dues
  ///      remaining for the current epoch. Reverts if the member hasn't opted in, isn't a member, the
  ///      net isn't started, nothing is owed, or the allowance is insufficient.
  /// @param id The Safety Net ID
  /// @param member The address of the member to deposit for
  function depositIfAllowed(uint256 id, address member) external;

  /// @notice Batch deposit for multiple members across multiple Safety Nets
  /// @dev Arrays must be the same length. All deposits must succeed or the entire transaction reverts
  ///      (all-or-nothing), mirroring the reference extension.
  /// @param ids Array of Safety Net IDs
  /// @param members Array of member addresses, parallel to `ids`
  function batchDepositIfAllowed(uint256[] calldata ids, address[] calldata members) external;

  /// @notice Check if delegated deposits are enabled for a member
  /// @param member The address to check
  /// @return enabled Whether delegated deposits are enabled
  function isDelegatedDepositsEnabled(address member) external view returns (bool enabled);

  /// @notice Enumerate (Safety Net, member) pairs eligible for a delegated deposit right now
  /// @dev Two-pass count-then-fill over all Safety Nets. A pair is eligible when the net is started,
  ///      the member opted in, still owes a positive amount this epoch (or their onboarding deposit),
  ///      and has approved the main proxy for at least that amount. Decommissioned nets are skipped.
  /// @return ids Array of Safety Net IDs with eligible members
  /// @return members Array of eligible member addresses, parallel to `ids`
  function getAddressesForDeposit() external view returns (uint256[] memory ids, address[] memory members);
}
