// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IDelegatedSafetyNet, ISafetyNetExtra} from '../interfaces/IDelegatedSafetyNet.sol';
import {ISafetyNet} from '../interfaces/ISafetyNet.sol';

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/**
 * @title DelegatedSafetyNet
 * @notice Standalone extension enabling delegated ERC20 allowance-based deposits and batch operations
 *         for the main SafetyNet contract.
 * @dev Token flow adaptation: SafetyNet's `_deposit` pulls tokens from the member directly via its own
 *      `safeTransferFrom(member, ...)`, and `depositFor(id, value, member)` is callable by anyone.
 *      Therefore members approve the MAIN SafetyNet proxy (NOT this extension); this contract only
 *      checks opt-in, the owed amount, and the member's allowance on the proxy, then calls
 *      `SAFETY_NET.depositFor(...)` which performs the transfer. No tokens ever touch this contract.
 * @author @RonTuretzky
 */
contract DelegatedSafetyNet is IDelegatedSafetyNet, ReentrancyGuard {
  /// @notice The main SafetyNet contract (proxy)
  ISafetyNet public immutable SAFETY_NET;

  /// @notice Mapping to track which members have enabled delegated deposits
  mapping(address member => bool enabled) public delegatedDepositsEnabled;

  /**
   * @notice Constructor
   * @param _safetyNet Address of the main SafetyNet contract (proxy)
   */
  constructor(address _safetyNet) {
    SAFETY_NET = ISafetyNet(_safetyNet);
  }

  /// @inheritdoc IDelegatedSafetyNet
  function setDelegatedDepositsEnabled(bool _enabled) external override {
    delegatedDepositsEnabled[msg.sender] = _enabled;
    emit DelegatedDepositsToggled(msg.sender, _enabled);
  }

  /// @inheritdoc IDelegatedSafetyNet
  function depositIfAllowed(uint256 _id, address _member) external override nonReentrant {
    _depositIfAllowed(_id, _member);
  }

  /// @inheritdoc IDelegatedSafetyNet
  function batchDepositIfAllowed(uint256[] calldata _ids, address[] calldata _members) external override nonReentrant {
    // Validate array lengths match
    if (_ids.length != _members.length) revert ArrayLengthMismatch();

    // All-or-nothing: any single failure reverts the whole batch, mirroring the reference extension
    for (uint256 i = 0; i < _ids.length; i++) {
      _depositIfAllowed(_ids[i], _members[i]);
    }
  }

  /// @inheritdoc IDelegatedSafetyNet
  function isDelegatedDepositsEnabled(address _member) external view override returns (bool) {
    return delegatedDepositsEnabled[_member];
  }

  /// @inheritdoc IDelegatedSafetyNet
  function getAddressesForDeposit() external view override returns (uint256[] memory ids, address[] memory members) {
    uint256 _nextId = ISafetyNetExtra(address(SAFETY_NET)).nextId();

    // First pass: count eligible (net, member) pairs across all Safety Nets
    uint256 _eligibleCount = 0;
    for (uint256 _id = 0; _id < _nextId; _id++) {
      // Skip decommissioned nets (getSafetyNet reverts NotCommissioned for them)
      try SAFETY_NET.getSafetyNet(_id) returns (ISafetyNet.SafetyNet memory _safetyNet) {
        if (_safetyNet.safetyNetStart == 0) continue; // Not started: no dues yet

        address[] memory _members = SAFETY_NET.getMembers(_id);
        for (uint256 j = 0; j < _members.length; j++) {
          if (_isEligible(_id, _safetyNet, _members[j])) _eligibleCount++;
        }
      } catch {
        continue;
      }
    }

    ids = new uint256[](_eligibleCount);
    members = new address[](_eligibleCount);

    // Second pass: fill the parallel arrays
    uint256 _index = 0;
    for (uint256 _id = 0; _id < _nextId; _id++) {
      try SAFETY_NET.getSafetyNet(_id) returns (ISafetyNet.SafetyNet memory _safetyNet) {
        if (_safetyNet.safetyNetStart == 0) continue;

        address[] memory _members = SAFETY_NET.getMembers(_id);
        for (uint256 j = 0; j < _members.length; j++) {
          if (_isEligible(_id, _safetyNet, _members[j])) {
            ids[_index] = _id;
            members[_index] = _members[j];
            _index++;
          }
        }
      } catch {
        continue;
      }
    }

    return (ids, members);
  }

  /**
   * @notice Executes a delegated deposit for a member if all conditions are met
   * @dev Internal delegated deposit: opt-in + owed-amount + allowance checks, then `depositFor`.
   * @param _id Safety Net ID
   * @param _member Member address to deposit for
   */
  function _depositIfAllowed(uint256 _id, address _member) internal {
    // Member must have opted in to delegated deposits
    if (!delegatedDepositsEnabled[_member]) revert DelegatedDepositsNotEnabled();

    // Reads the net; reverts NotCommissioned for decommissioned nets (propagated)
    ISafetyNet.SafetyNet memory _safetyNet = SAFETY_NET.getSafetyNet(_id);

    // Deposits are only valid after the net has been started
    if (_safetyNet.safetyNetStart == 0) revert ISafetyNet.NotActive();

    // Member must belong to the net
    if (!ISafetyNetExtra(address(SAFETY_NET)).isMember(_id, _member)) revert ISafetyNet.NotMember();

    uint256 _required = _requiredDeposit(_id, _safetyNet, _member);
    // Nothing owed this epoch (already onboarded and dues fully paid)
    if (_required == 0) revert ISafetyNet.AlreadyDeposited();

    // Member must have approved the MAIN proxy for at least the owed amount
    if (IERC20(_safetyNet.token).allowance(_member, address(SAFETY_NET)) < _required) revert InsufficientAllowance();

    // Main pulls `_required` from `_member` via its own transferFrom
    SAFETY_NET.depositFor(_id, _required, _member);
  }

  /**
   * @notice Computes the deposit amount a member currently owes
   * @dev Computes the amount a member owes right now, matching SafetyNet's deposit rules.
   *      Onboarding (contribution not yet set): exact `initialDeposit`. Otherwise: dues remaining
   *      this epoch (0 when fully paid).
   * @param _id Safety Net ID
   * @param _safetyNet The Safety Net struct
   * @param _member Member address
   * @return required The amount owed
   */
  function _requiredDeposit(uint256 _id, ISafetyNet.SafetyNet memory _safetyNet, address _member) internal view returns (uint256 required) {
    bool _onboarding = ISafetyNetExtra(address(SAFETY_NET)).safetyNetMemberContribute(_id, _member) == 0;
    required = _onboarding ? _safetyNet.initialDeposit : SAFETY_NET.duesRemainingThisEpoch(_id, _member);
  }

  /**
   * @notice Returns whether a member is eligible for a delegated deposit right now
   * @dev Whether a (net, member) pair is eligible for a delegated deposit right now.
   * @param _id Safety Net ID
   * @param _safetyNet The Safety Net struct
   * @param _member Member address
   * @return eligible True when opted in, still owes a positive amount, and the proxy allowance covers it
   */
  function _isEligible(uint256 _id, ISafetyNet.SafetyNet memory _safetyNet, address _member) internal view returns (bool eligible) {
    if (!delegatedDepositsEnabled[_member]) return false;

    uint256 _required = _requiredDeposit(_id, _safetyNet, _member);
    if (_required == 0) return false;

    return IERC20(_safetyNet.token).allowance(_member, address(SAFETY_NET)) >= _required;
  }
}
