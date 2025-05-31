// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {OwnableUpgradeable} from '@openzeppelin-upgradeable/access/OwnableUpgradeable.sol';
import {IERC20} from '@openzeppelin/token/ERC20/IERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/utils/ReentrancyGuard.sol';

import {IBreadfund} from '../interfaces/IBreadfund.sol';

/**
 * @title Breadfund
 * @notice Simple implementation of a Broodfond for ERC20 tokens
 * @author Breadchain Collective
 * @author @exo404
 * @author @valeriooconte
 */
contract Breadfund is IBreadfund, ReentrancyGuard, OwnableUpgradeable {
  uint256 public constant MINIMUM_MEMBERS = 25;
  uint256 public constant MAXIMUM_MEMBERS = 50;
  uint256 public nextId;

  mapping(uint256 id => Breadfund breadfund) public breadfunds;  
}