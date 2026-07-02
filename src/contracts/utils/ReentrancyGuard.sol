// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.5.0) (utils/ReentrancyGuard.sol)
pragma solidity ^0.8.28;

import {StorageSlot} from '@openzeppelin/contracts/utils/StorageSlot.sol';

/// @title ReentrancyGuard
/// @author OpenZeppelin (vendored, logic unchanged)
/// @notice Contract module that helps prevent reentrant calls to a function
/// @dev Vendored verbatim from OpenZeppelin Contracts v5.5.0 solely so the constructor below can carry
///      the `oz-upgrades-unsafe-allow` annotation: the upgrades-core validator cannot suppress
///      constructor findings reported on inherited contracts inside node_modules (the
///      `-reachable` annotation variant only covers delegatecall/selfdestruct findings), so the
///      annotation must live on the parent contract itself.
///
///      Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier available, which can be
///      applied to functions to make sure there are no nested (reentrant) calls to them.
///
///      Note that because there is a single `nonReentrant` guard, functions marked as `nonReentrant` may
///      not call one another. This can be worked around by making those functions `private`, and then
///      adding `external` `nonReentrant` entry points to them.
/// @custom:stateless
abstract contract ReentrancyGuard {
  using StorageSlot for bytes32;

  /// @dev keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 private constant _REENTRANCY_GUARD_STORAGE = 0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

  /// @dev Guard statuses. Non-zero values make deployment slightly more expensive but lower the refund
  ///      on every call to nonReentrant (refunds are capped to a percentage of the total transaction gas).
  uint256 private constant _NOT_ENTERED = 1;
  uint256 private constant _ENTERED = 2;

  /// @notice Unauthorized reentrant call
  error ReentrancyGuardReentrantCall();

  /// @dev This constructor only presets the guard slot to `NOT_ENTERED` (1) as a gas optimization for
  ///      direct deployments. Behind a proxy the slot simply starts at 0, which is functionally
  ///      equivalent (the guard checks `== ENTERED`), so skipping it is safe for upgradeable use.
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _reentrancyGuardStorageSlot().getUint256Slot().value = _NOT_ENTERED;
  }

  /// @dev Prevents a contract from calling itself, directly or indirectly. Calling a `nonReentrant`
  ///      function from another `nonReentrant` function is not supported.
  modifier nonReentrant() {
    _nonReentrantBefore();
    _;
    _nonReentrantAfter();
  }

  /// @dev A `view` only version of {nonReentrant}. Use to block view functions from being called,
  ///      preventing reading from inconsistent contract state. Does not change the reentrancy status.
  modifier nonReentrantView() {
    _nonReentrantBeforeView();
    _;
  }

  /// @dev Reverts with {ReentrancyGuardReentrantCall} if the guard is currently entered
  function _nonReentrantBeforeView() private view {
    if (_reentrancyGuardEntered()) {
      revert ReentrancyGuardReentrantCall();
    }
  }

  /// @dev Marks the guard as entered; any nested call to nonReentrant after this point will fail
  function _nonReentrantBefore() private {
    // On the first call to nonReentrant, the slot will be NOT_ENTERED
    _nonReentrantBeforeView();

    // Any calls to nonReentrant after this point will fail
    _reentrancyGuardStorageSlot().getUint256Slot().value = _ENTERED;
  }

  /// @dev Restores the guard to _NOT_ENTERED, triggering a gas refund (see EIP-2200)
  function _nonReentrantAfter() private {
    _reentrancyGuardStorageSlot().getUint256Slot().value = _NOT_ENTERED;
  }

  /// @notice Returns true if the reentrancy guard is currently set to "entered", which indicates there
  ///         is a `nonReentrant` function in the call stack
  /// @return _entered Whether the guard is currently entered
  function _reentrancyGuardEntered() internal view returns (bool _entered) {
    return _reentrancyGuardStorageSlot().getUint256Slot().value == _ENTERED;
  }

  /// @notice Returns the dedicated EIP-7201 storage slot used by the guard
  /// @return _slot The guard's storage slot
  function _reentrancyGuardStorageSlot() internal pure virtual returns (bytes32 _slot) {
    return _REENTRANCY_GUARD_STORAGE;
  }
}
