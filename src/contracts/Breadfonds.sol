// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {OwnableUpgradeable} from '@openzeppelin-upgradeable/access/OwnableUpgradeable.sol';
import {IERC20} from '@openzeppelin/token/ERC20/IERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/utils/ReentrancyGuard.sol';

import {IBreadfonds} from '../interfaces/IBroodfonds.sol';

/**
 * @title Breadfonds
 * @notice Simple implementation of a Broodfond for ERC20 tokens
 * @author Breadchain Collective
 * @author @exo404
 * @author @valeriooconte
 */
contract Breadfonds is IBreadfonds, ReentrancyGuard, OwnableUpgradeable {
  uint256 public constant MINIMUM_MEMBERS = 25;
  uint256 public constant MAXIMUM_MEMBERS = 50;
  uint256 public nextId;

  mapping(uint256 id => Breadfonds fond) public breadfonds;
  mapping(uint256 id => mapping(address token => uint256 balance)) public balances;
  mapping(uint256 id => mapping(address member => bool status)) public isMember;
  mapping(address member => uint256[] ids) public memberBreadfonds;
  mapping(uint256 id => mapping(address member => uint256 withdraws)) public breadfondsMemberWithdrawals;
  mapping(uint256 id => mapping(address member => uint256 contribute)) public breadfondsMemberContribute;
  mapping(address token => bool status) public allowedTokens;

  /// @inheritdoc IBreadfonds
  function create(Breadfonds memory _breadfonds) external override returns (uint256 _id) {
    _id = nextId++;

    if (_breadfonds[_id].owner != address(0)) revert AlreadyExists();
    if (!allowedTokens[_breadfonds.token]) revert TokenNotAllowed();
    if (_breadfonds.depositInterval == 0) revert InvalidDepositInterval();
    if (_breadfonds.depositAmount == 0) revert InvalidDepositAmount();
    if (_breadfonds.maxDeposits == 0) revert InvalidMaxDeposits();
    if (_breadfonds.fondStart == 0) revert InvalidfondStartTime();
    if (_breadfonds.currentIndex != 0) revert InvalidCurrentIndex();
    if (_breadfonds.owner == address(0)) revert InvalidOwner();
    if (_breadfonds.members.length < MINIMUM_MEMBERS) revert InvalidMemberCount();
    if (_breadfonds.members.length > MAXIMUM_MEMBERS) revert InvalidMemberCount();
    if (_breadfonds.members.length != _breadfonds.depositAmount.length) revert InvalidMemberCount();

    // Broodfonds specific checks
    if (_breadfonds.initialDeposit <= 0) revert InvalidInitialDeposit();
    if (_breadfonds.fixedDeposit <= 0) revert InvalidFixedDeposit();
    if (_breadfonds.maxwithdraws <= 0) revert InvalidMaxWithdraws();
    if (_breadfonds.maxwithdraws > 24) revert InvalidMaxWithdraws();

    //Caching the fond members length to avoid multiple lookups
    uint256 _breadfondsMembersLength = _breadfonds.members.length;

    for (uint256 i = 0; i < _breadfondsMembersLength; i++) {
      address _member = _breadfonds.members[i];
      if (_member == address(0)) revert InvalidMemberAddress();
      isMember[_id][_member] = true;
      memberBreadfonds[_member].push(_id);
      breadfondsMemberContribute[_id][_member] = _fond.depositAmount[i];
    }

    breadfonds[_id] = _breadfonds;

    emit BreadfondsCreated(_id, _breadfonds.members, _breadfonds.token, _breadfonds.depositAmount, _breadfonds.depositInterval, _breadfonds.fixedDeposit, _breadfonds.maxwithdraws, _breadfonds.depositAmount);
    return _id;
  }

  /// @inheritdoc IBreadfonds
  function decommission(uint256 _id) external override nonReentrant {
    Breadfonds memory _breadfonds = breadfonds[_id];

    //Caching the fond members variables to avoid multiple lookups
    uint256 _breadfondsMembersLength = _breadfonds.members.length;
    uint256 _breadfondsDepositAmount = _breadfonds.depositAmount;

    bool hasIncompleteDeposits = false;
    for (uint256 i = 0; i < _breadfondsMembersLength; i++) {
      if (balances[_id][_breadfonds.members[i]] < _breadfondsDepositAmount) {
        hasIncompleteDeposits = true;
        break;
      }
    }
    if (!hasIncompleteDeposits) revert NotDecommissionable();

    // Return deposits to members
    for (uint256 i = 0; i < _breadfondsMembersLength; i++) {
      address _member = _breadfonds.members[i];
      uint256 _balance = balances[_id][_member];

      if (_balance > 0) {  
        balances[_id][_member] = 0;
        bool success = IERC20(_breadfonds.token).transfer(_member, _balance);
        if (!success) revert TransferFailed();
      }
    }

    delete breadfonds[_id];

    emit BreadfondsDecommissioned(_id);
  }
  
}
