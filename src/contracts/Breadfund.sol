// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {OwnableUpgradeable} from '@openzeppelin-upgradeable/access/OwnableUpgradeable.sol';
import {IERC20} from '@openzeppelin/token/ERC20/IERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/utils/ReentrancyGuard.sol';

import {IBreadfund} from '../interfaces/IBreadfund.sol';

/// @title Breadfund
/// @notice Simple implementation of a Broodfond for ERC20 tokens
/// @author @exo404
/// @author @valeriooconte
/// @author @RonTuretzky
contract Breadfund is IBreadfund, ReentrancyGuard, OwnableUpgradeable {
  uint256 public constant MINIMUM_MEMBERS = 25;
  uint256 public constant MAXIMUM_MEMBERS = 50;
  uint256 public constant MINIMUM_CONTRIBUTE = 35;
  uint256 public constant MAXIMUM_CONTRIBUTE = 115;
  uint256 public nextId;

  mapping(uint256 id => Breadfund breadfund) public breadfunds;
  mapping(uint256 id => mapping(address member => bool status)) public isMember;
  mapping(address member => uint256[] ids) public memberBreadfunds;
  mapping(uint256 id => mapping(address member => uint256 withdrawals)) public breadfundMemberWithdrawals;
  mapping(uint256 id => mapping(address member => uint256 contribute)) public breadfundMemberContribute;
  mapping(uint256 id => mapping(address member => bool status)) public breadfundMonthPayed;
  mapping(uint256 id => uint256 balance) public breadfundBalance;
  mapping(address token => bool status) public allowedTokens;
  mapping(uint256 id => mapping(address member => uint256 balance)) public balances;
  
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /// @inheritdoc IBreadfund
  function initialize(address _owner) external override initializer {
    __Ownable_init_unchained(_owner);
  }

  /// @inheritdoc IBreadfund
  function setTokenAllowed(address _token, bool _allowed) external override onlyOwner {
    allowedTokens[_token] = _allowed;

    emit TokenAllowed(_token, _allowed);
  }

  /// @inheritdoc IBreadfund
  function create(Breadfund memory _breadfund) external override nonReentrant returns (uint256 _id) {
    _id = nextId++;

    if (breadfunds[_id].owner != address(0)) revert AlreadyExists();
    if (!allowedTokens[_breadfund.token]) revert TokenNotAllowed();
    if (_breadfund.depositInterval <= 0) revert InvalidDepositInterval();
    if (_breadfund.breadfundStart == 0) revert InvalidBreadfundStartTime();
    if (_breadfund.owner == address(0)) revert InvalidOwner();
    if (_breadfund.members.length < MINIMUM_MEMBERS) revert InvalidMemberCount();
    if (_breadfund.members.length > MAXIMUM_MEMBERS) revert InvalidMemberCount();
    if (_breadfund.initialDeposit <= 0) revert InvalidInitialDeposit();
    if (_breadfund.fixedDeposit <= 0) revert InvalidFixedDeposit();
    if (_breadfund.maxWithdraws <= 0) revert InvalidMaxWithdraws();
    if (_breadfund.maxWithdraws > 24) revert InvalidMaxWithdraws();

    uint256 _breadfundMembersLength = _breadfund.members.length;

    for (uint256 i = 0; i < _breadfundMembersLength; i++) {
      address _member = _breadfund.members[i];
      if (_member == address(0)) revert InvalidMemberAddress();
      isMember[_id][_member] = true;
      memberBreadfunds[_member].push(_id);
    }

    breadfunds[_id] = _breadfund;

    emit BreadfundCreated(
      _id,
      _breadfund.members,
      _breadfund.token,
      _breadfund.initialDeposit,
      _breadfund.depositInterval,
      _breadfund.fixedDeposit,
      _breadfund.maxWithdraws
    );
    return _id;
  }

  /// @inheritdoc IBreadfund
  function decommission(uint256 _id) external override nonReentrant {
    Breadfund memory _breadfund = breadfunds[_id];

    uint256 _breadfundMembersLength = _breadfund.members.length;

    bool hasIncompleteDeposits = false;
    for (uint256 i = 0; i < _breadfundMembersLength; i++) {
      if (breadfundMonthPayed[_id][_breadfund.members[i]] == false) {
        hasIncompleteDeposits = true;
        break;
      }
    }
    if (!hasIncompleteDeposits) revert NotDecommissionable();

    uint256 _totalDeposits = 0;
    // Return deposits to members
    for (uint256 i = 0; i < _breadfundMembersLength; i++) {
      _totalDeposits += breadfundMemberContribute[_id][_breadfund.members[i]];
    }

    for (uint256 i = 0; i < _breadfundMembersLength; i++) {
      address _member = _breadfund.members[i];
      uint256 _amount = breadfundMemberContribute[_id][_member] / _totalDeposits * breadfundBalance[_id];
      if (_amount > 0) {
        bool success = IERC20(_breadfund.token).transfer(_member, _amount);
        if (!success) revert TransferFailed();
      }
    }

    delete breadfunds[_id];
    emit BreadfundDecommissioned(_id);
  }

  /// @inheritdoc IBreadfund
  function deposit(uint256 _id, uint256 _value) external override nonReentrant {
    _deposit(_id, _value, msg.sender);
  }

  /// @inheritdoc IBreadfund
  function register(uint256 _id, uint256 _contribute) external override {
    Breadfund memory _breadfund = breadfunds[_id];

    if (_isDecommissioned(_breadfund)) revert NotCommissioned();
    if (isMember[_id][msg.sender]) revert AlreadyExists();
    if (_breadfund.members.length == MAXIMUM_MEMBERS) revert InvalidMemberCount();
    if (_contribute < MINIMUM_CONTRIBUTE) revert InvalidDeposit();
    if (_contribute > MAXIMUM_CONTRIBUTE) revert InvalidDeposit();

    _payInitialDeposit(_id);
    _deposit(_id, _contribute, msg.sender);

    breadfunds[_id].members.push(msg.sender);
    isMember[_id][msg.sender] = true;
    memberBreadfunds[msg.sender].push(_id);
    breadfundMemberContribute[_id][msg.sender] = _contribute;
    breadfundMonthPayed[_id][msg.sender] = true;

    emit NewBreadfundMember(_id, msg.sender, _contribute);
  }

  /// @inheritdoc IBreadfund
  function isTokenAllowed(address _token) external view override returns (bool) {
    return allowedTokens[_token];
  }

  /// @inheritdoc IBreadfund
  function getBreadfund(uint256 _id) external view override returns (Breadfund memory _breadfund) {
    _breadfund = breadfunds[_id];

    if (_isDecommissioned(_breadfund)) revert NotCommissioned();
  }

  /// @inheritdoc IBreadfund
  function getBreadfunds(uint256[] calldata _ids) external view returns (Breadfund[] memory _breadfunds) {
    _breadfunds = new Breadfund[](_ids.length);

    for (uint256 i = 0; i < _ids.length; i++) {
      _breadfunds[i] = breadfunds[_ids[i]];
    }
  }

  /// @inheritdoc IBreadfund
  function getMemberBreadfunds(address _member) external view returns (uint256[] memory _ids) {
    return memberBreadfunds[_member];
  }

  /// @inheritdoc IBreadfund
  function getMemberBalances(uint256 _id)
    external
    view
    override
    returns (address[] memory _members, uint256[] memory _balances)
  {
    Breadfund memory _breadfund = breadfunds[_id];

    if (_isDecommissioned(_breadfund)) revert NotCommissioned();

    _balances = new uint256[](_breadfund.members.length);
    for (uint256 i = 0; i < _breadfund.members.length; i++) {
      _balances[i] = balances[_id][_breadfund.members[i]];
    }

    return (_breadfund.members, _balances);
  }

  /// @dev Make a one-time deposit to register successfully to the Breadfund
  function _payInitialDeposit(uint256 _id) internal nonReentrant {
    Breadfund memory _breadfund = breadfunds[_id];
    breadfundBalance[_id] += _breadfund.initialDeposit;
    bool _success = IERC20(msg.sender).transfer(_breadfund.token, _breadfund.initialDeposit);
    if (!_success) revert TransferFailed();
  }

  /// @dev Make a deposit for monthly contribute + administrative fee
  function _deposit(uint256 _id, uint256 _value, address _member) internal {
    Breadfund memory _breadfund = breadfunds[_id];

    if (_breadfund.owner == address(0)) revert NotCommissioned();
    if (!isMember[_id][msg.sender]) revert NotMember();
    if (_value <= 0) revert InvalidDepositAmount();
    if (block.timestamp < _breadfund.breadfundStart) revert DepositBeforeBreadfundStart();

    breadfundBalance[_id] += _value + _breadfund.fixedDeposit;
    bool _success = IERC20(_member).transfer(_breadfund.token, _value + _breadfund.fixedDeposit);
    if (!_success) revert TransferFailed();
  }

  /// @dev Return if a specified Breadfund is decomissioned by checking if an owner is set
  function _isDecommissioned(Breadfund memory _breadfund) internal pure returns (bool) {
    return _breadfund.owner == address(0);
  }
}