// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {OwnableUpgradeable} from '@openzeppelin-upgradeable/access/OwnableUpgradeable.sol';
import {IERC20} from '@openzeppelin/token/ERC20/IERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/utils/ReentrancyGuard.sol';

import {IBreadfund} from '../interfaces/IBreadfund.sol';
import {BokkyPooBahsDateTimeContract} from '../utility/BokkyPooBahsDateTimeContract_flattened_v1.00.sol';

/// @title Breadfund
/// @notice Simple implementation of a Broodfond for ERC20 tokens
/// @author @exo404
/// @author @valeriooconte
/// @author @RonTuretzky
contract Breadfund is IBreadfund, ReentrancyGuard, OwnableUpgradeable, BokkyPooBahsDateTimeContract {
  /// @notice Minimum number of members required to create a Breadfund
  uint256 public constant MINIMUM_MEMBERS = 25;

  /// @notice Maximum number of members allowed in a Breadfund
  uint256 public constant MAXIMUM_MEMBERS = 50;

  /// @notice ID counter used to assign unique identifiers to each Breadfund
  uint256 public nextId;

  /// @notice Stores all created Breadfunds indexed by their unique ID
  mapping(uint256 id => Breadfund breadfund) public breadfunds;

  /// @notice Indicates whether a specific address is a member of the Breadfund with the given ID
  mapping(uint256 id => mapping(address member => bool status)) public isMember;

  /// @notice Lists all Breadfund IDs that a given member has joined
  mapping(address member => uint256[] ids) public memberBreadfunds;

  /// @notice Tracks personal savings of each member in a given Breadfund
  mapping(uint256 id => mapping(address member => uint256 monthlyContribute)) public breadfundMemberContribute;

  /// @notice Tracks withdrawable amount for each member in a given Breadfund
  mapping(uint256 id => mapping(address member => uint256 withdrawableBalance)) public memberWithdrawableBalance;

  /// @notice Tracks whether each member has paid their monthly contribution for a specific Breadfund
  mapping(uint256 id => mapping(address member => bool status)) public breadfundMonthPayed;

  /// @notice Holds the total balance of each Breadfund
  mapping(uint256 id => uint256 balance) public breadfundBalance;

  /// @notice Indicates whether a specific ERC20 token is allowed for use in Breadfunds
  mapping(address token => bool status) public allowedTokens;

  /// @notice Records the current balance of each member within a specific Breadfund
  mapping(uint256 id => mapping(address member => uint256 balance)) public balances;

  /// @notice Tracks whether a member has made their first deposit in a specific Breadfund
  mapping(uint256 id => mapping(address member => bool hasDeposited)) public hasMadeFirstDeposit;
  
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
    if (_breadfund.maxWithdrawals <= 0) revert InvalidMaxWithdrawals();
    if (_breadfund.ratio <= 1) revert InvalidRatio();
    if (_breadfund.ratio <= 0) revert InvalidThreshold();

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
      _breadfund.maxWithdrawals,
      _breadfund.ratio
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
  function withdraw(uint256 _id, uint256 _daysRequested) external override nonReentrant {
    _withdraw(_id, msg.sender, _daysRequested);
  }

  /// @inheritdoc IBreadfund
  function createRequest(Request memory request) external override returns (uint256) {
    return _createRequest(request);
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
  function getBreadfunds(uint256[] calldata _ids) external view override returns (Breadfund[] memory _breadfunds) {
    _breadfunds = new Breadfund[](_ids.length);

    for (uint256 i = 0; i < _ids.length; i++) {
      _breadfunds[i] = breadfunds[_ids[i]];
    }
  }

  /// @inheritdoc IBreadfund
  function getMemberBreadfunds(address _member) external view override returns (uint256[] memory _ids) {
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

  /**
   * @dev Make a deposit for monthly contribute
   *      If it's the first deposit, initialDeposit amount is added to the total amount
   *      The method "transferFrom()" requires "approve()" front-end side
   */
  function _deposit(uint256 _id, uint256 _value, address _member) internal {
    Breadfund memory _breadfund = breadfunds[_id];

    if (_breadfund.owner == address(0)) revert NotCommissioned();
    if (!isMember[_id][_member]) revert NotMember();
    if (_value <= 0) revert InvalidDepositAmount();
    if (block.timestamp < _breadfund.breadfundStart) revert DepositBeforeBreadfundStart();

    uint256 _totalDeposit = _value + _breadfund.fixedDeposit;

    if (!hasMadeFirstDeposit[_id][_member]) {
      breadfundMemberContribute[_id][_member] = _value;
      _totalDeposit += _breadfund.initialDeposit;
      hasMadeFirstDeposit[_id][_member] = true;
    }

    breadfundBalance[_id] += _totalDeposit;

    memberWithdrawableBalance[_id][_member] += _value * _breadfund.ratio;

    bool _success = IERC20(_breadfund.token).transferFrom(_member, address(this), _totalDeposit);
    if (!_success) revert TransferFailed();

    emit FundsDeposited(_id, _member, _totalDeposit);
  }

  /**
   * @dev Make a withdrawal
   *      
   *      
   */
  function _withdraw(uint256 _id, address _member, uint256 _daysRequested) internal {
    Breadfund memory _breadfund = breadfunds[_id];

    if (_breadfund.owner == address(0)) revert NotCommissioned();
    if (!isMember[_id][_member]) revert NotMember();
    
    uint256 _dailyWithdrawableAmount = _getDailyWithdrawableAmount(_id, _member, _breadfund.ratio);

    uint256 _withdrawAmount = _dailyWithdrawableAmount * _daysRequested;

    if (_withdrawAmount > memberWithdrawableBalance[_id][_member]) revert NotWithdrawable();

    if (_isSmall(_breadfund.autoThreshold, _withdrawAmount)) {
      memberWithdrawableBalance[_id][_member] -= _withdrawAmount;

      bool success = IERC20(_breadfund.token).transfer(_member, _withdrawAmount);
      if (!success) revert TransferFailed();

      emit FundsWithdrawn(_id, _member, _withdrawAmount);
    } else {
      // TBD

      emit WithdrawalPending()
    }
  }

  /// @dev Calculates the daily withdrawal for a member in a Breadfund
  function _getDailyWithdrawableAmount(uint256 _id, address _member, uint256 _ratio) internal view returns (uint256) {
    uint256 _memberContribute = breadfundMemberContribute[_id][_member];

    uint256 _monthlyWithdrawalAmount = _memberContribute * _ratio;

    uint _timestamp = block.timestamp;

    uint _currentYear = getYear(_timestamp);
    uint _currentMonth = getMonth(_timestamp);

    uint _daysInCurrentMonth = _getDaysInMonth(_currentYear, _currentMonth);

    return _monthlyWithdrawalAmount / _daysInCurrentMonth;
  }

  /// @dev
  function _createRequest(Request memory request) internal returns (uint256) {
    // TBD
  }

  /// @dev
  function _isSmall(uint256 _autoThreshold, uint256 _withdrawAmount) internal pure returns (bool) {
    return _withdrawAmount <= _autoThreshold;
  }

  /// @dev Return if a specified Breadfund is decomissioned by checking if an owner is set
  function _isDecommissioned(Breadfund memory _breadfund) internal pure returns (bool) {
    return _breadfund.owner == address(0);
  }
}