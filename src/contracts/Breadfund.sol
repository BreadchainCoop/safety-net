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
  /// @notice Minimum number of members required to create a Breadfund
  uint256 public constant MINIMUM_MEMBERS = 25;

  /// @notice Maximum number of members allowed in a Breadfund
  uint256 public constant MAXIMUM_MEMBERS = 50;

  /// @notice Number of days in a month (used for calculating monthly withdrawals)
  uint256 public constant DAYS_IN_A_MONTH = 30;

  /// @notice ID counter used to assign unique identifiers to each Breadfund
  uint256 public nextId;

  /// @notice ID counter used to assign unique identifiers to each request
  uint256 public nextIdRequest;

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

  /// @notice Holds the total balance of each Breadfund
  mapping(uint256 id => uint256 balance) public breadfundBalance;

  /// @notice Indicates whether a specific ERC20 token is allowed for use in Breadfunds
  mapping(address token => bool status) public allowedTokens;

  /// @notice Tracks whether a member has made their first deposit in a specific Breadfund
  mapping(uint256 id => mapping(address member => bool hasDeposited)) public hasMadeFirstDeposit;

  /// @notice Lists all requests indexed by their unique ID
  mapping(uint256 idReq => Request request) public requests;

  /// @notice Records votes for each request, mapping request ID to member address and their vote status
  mapping(uint256 idReq => mapping(address member => bool status)) public requestVotes;

  /// @notice Tracks if a request has been contested
  mapping(uint256 id => bool contested) public isContested;

  /// @notice Tracks if a request has been verified (voting phase is over)
  mapping(uint256 id => bool voted) public isVoted;

  /// @notice Tracks if a request has been executed
  mapping(uint256 id => bool executed) public isExecuted;

  /// @notice Thrown if a transfer fails
  error TransferFailed();

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
    if (_breadfund.breadfundStart == 0) revert InvalidBreadfundStartTime();
    if (_breadfund.owner == address(0)) revert InvalidOwner();
    if (_breadfund.members.length < MINIMUM_MEMBERS) revert InvalidMemberCount();
    if (_breadfund.members.length > MAXIMUM_MEMBERS) revert InvalidMemberCount();
    if (_breadfund.initialDeposit <= 0) revert InvalidInitialDeposit();
    if (_breadfund.fixedDeposit <= 0) revert InvalidFixedDeposit();
    if (_breadfund.autoThreshold <= 0) revert InvalidThreshold();
    if (_breadfund.minimumMembers < 2) revert InvalidMinimumMembers();
    if (_breadfund.maximumMembers < _breadfund.minimumMembers) revert InvalidMaximumMembers();

    uint256 _breadfundMembersLength = _breadfund.members.length;

    for (uint256 i = 0; i < _breadfundMembersLength; i++) {
      address _member = _breadfund.members[i];
      if (_member == address(0)) revert InvalidMemberAddress();
      isMember[_id][_member] = true;
      memberBreadfunds[_member].push(_id);
    }

    _breadfund.id = _id;
    breadfunds[_id] = _breadfund;

    emit BreadfundCreated(
      _id,
      _breadfund.minimumMembers,
      _breadfund.maximumMembers,
      _breadfund.consensusThreshold,
      _breadfund.members,
      _breadfund.token,
      _breadfund.initialDeposit,
      _breadfund.fixedDeposit,
      _breadfund.ratio,
      _breadfund.autoThreshold
    );
    return _id;
  }

  /// @inheritdoc IBreadfund
  function decommission(uint256 _id) external override nonReentrant {
    Breadfund memory _breadfund = breadfunds[_id];
    uint256 _breadfundMembersLength = _breadfund.members.length;

    for (uint256 i = 0; i < _breadfundMembersLength; i++) {
      if (!hasMadeFirstDeposit[_id][_breadfund.members[i]]) revert NotDecommissionable();
    }

    uint256 _balance = breadfundBalance[_id];

    breadfundBalance[_id] = 0;

    for (uint256 i = 0; i < _breadfundMembersLength; i++) {
      address _member = _breadfund.members[i];
      uint256 _amount = memberWithdrawableBalance[_id][_member];
      if (_amount > 0) {
        memberWithdrawableBalance[_id][_member] = 0;
        _balance -= _amount;

        if (!IERC20(_breadfund.token).transfer(_member, _amount)) revert TransferFailed();
      }
    }

    if (_balance > 0) {
      uint256 _amount = _balance / _breadfundMembersLength;

      for (uint256 i = 0; i < _breadfundMembersLength; i++) {
        address _member = _breadfund.members[i];
        if (!IERC20(_breadfund.token).transfer(_member, _amount)) revert TransferFailed();
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
  function depositFor(uint256 _id, uint256 _value, address _member) external override nonReentrant {
    _deposit(_id, _value, _member);
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
  function contest(uint256 _requestId) external override nonReentrant {
    Request storage _request = requests[_requestId];

    if (!_isContestable(_requestId)) revert ContestWindowClosed();
    if (!isMember[_request.breadfundId][msg.sender]) revert NotMember();
    if (isContested[_requestId]) revert AlreadyContested();

    isContested[_requestId] = true;

    emit WithdrawalContested(_requestId, _request.owner, block.timestamp);
  }

  /// @inheritdoc IBreadfund
  function executeWithdrawal(uint256 _idRequest) external override nonReentrant {
    Request memory _request = requests[_idRequest];
    if (isExecuted[_idRequest]) revert AlreadyExecuted();
    if (!_isContestable(_idRequest)) {
      if (!isContested[_idRequest]) {
        Breadfund memory _breadfund = breadfunds[_request.breadfundId];
        isExecuted[_idRequest] = true;
        if (!IERC20(_breadfund.token).transfer(_request.owner, _request.amount)) revert TransferFailed();
        emit WithdrawalAutoExecuted(_idRequest, _request.owner, _request.amount);
      } else {
        emit WithdrawalContested(_idRequest, _request.owner, block.timestamp);
      }
    }
  }

  function vote(uint256 _requestId, bool _vote) external override nonReentrant {
    if (!isMember[requests[_requestId].breadfundId][msg.sender]) revert NotMember();
    if (requestVotes[_requestId][msg.sender]) revert AlreadyVoted();
    if (!_isVotingOngoing(_requestId)) revert VotingWindowClosed();

    if (_vote) {
      requests[_requestId].yesVotes++;
    } else {
      requests[_requestId].noVotes++;
    }
    requestVotes[_requestId][msg.sender] = true;
    emit Voted(_requestId, msg.sender, _vote);
  }
  /// @inheritdoc IBreadfund

  function checkVotingWindow(uint256 _idRequest) external override nonReentrant {
    Request memory _request = requests[_idRequest];
    if (!_isVotingOngoing(_idRequest) && !isVoted[_idRequest]) {
      isVoted[_idRequest] = true;
      Breadfund memory _breadfund = breadfunds[_request.breadfundId];
      if (_request.yesVotes > _breadfund.members.length * _breadfund.consensusThreshold / 100) {
        isExecuted[_idRequest] = true;
        if (!IERC20(_breadfund.token).transfer(_request.owner, _request.amount)) revert TransferFailed();
        emit WithdrawalApproved(_idRequest, _request.owner, _request.amount);
      } else {
        emit WithdrawalRejected(_idRequest, _request.owner, _request.amount);
      }
    }
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
      _balances[i] = memberWithdrawableBalance[_id][_breadfund.members[i]];
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

    if (!IERC20(_breadfund.token).transferFrom(_member, address(this), _totalDeposit)) revert TransferFailed();

    emit FundsDeposited(_id, _member, _totalDeposit);
  }

  /**
   * @dev Create a request for withdrawal
   * @param _request The request to be created
   * @return _idRequest The ID of the created request
   */
  function _createRequest(Request memory _request) internal returns (uint256) {
    uint256 _idRequest = nextIdRequest++;

    if (_request.owner == address(0)) revert InvalidRequest();
    if (requests[_idRequest].owner != address(0)) revert AlreadyExists();
    if (breadfunds[_request.breadfundId].owner == address(0)) revert NotCommissioned();

    requests[_idRequest] = _request;

    emit RequestCreated(_idRequest, _request.owner, _request.timestamp, _request.amount);
    return _idRequest;
  }

  /**
   * @dev Make a withdrawal
   * @param _id The ID of the Breadfund
   * @param _member The address of the member making the withdrawal
   * @param _daysRequested The number of days for which the member is requesting a withdrawal
   * @notice If the requested amount is small, it is transferred directly to the member
   *         If the requested amount is large, a request is created for approval
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

      if (!IERC20(_breadfund.token).transfer(_member, _withdrawAmount)) revert TransferFailed();

      emit FundsWithdrawn(_id, _member, _withdrawAmount);
    } else {
      Request memory _request = Request({
        owner: _member,
        breadfundId: _id,
        timestamp: block.timestamp,
        yesVotes: 0,
        noVotes: 0,
        amount: _withdrawAmount
      });
      uint256 _idRequest = _createRequest(_request);
      emit WithdrawalPending(_idRequest, _member, _withdrawAmount);
    }
  }

  /// @dev Calculates the daily withdrawal for a member in a Breadfund
  function _getDailyWithdrawableAmount(uint256 _id, address _member, uint256 _ratio) internal view returns (uint256) {
    uint256 _memberContribute = breadfundMemberContribute[_id][_member];
    uint256 _monthlyWithdrawalAmount = _memberContribute * _ratio;
    return _monthlyWithdrawalAmount / DAYS_IN_A_MONTH;
  }

  /// @dev Check if a request is contestable by comparing the current timestamp with the request's timestamp and the contest window
  function _isContestable(uint256 _idRequest) internal view returns (bool) {
    Request memory _request = requests[_idRequest];
    return block.timestamp <= (_request.timestamp + breadfunds[_request.breadfundId].contestWindow);
  }

  /// @dev Check if a request's voting window is open by comparing the current timestamp with the request's timestamp and the voting window
  function _isVotingOngoing(uint256 _idRequest) internal view returns (bool) {
    Request memory _request = requests[_idRequest];
    return block.timestamp <= (_request.timestamp + breadfunds[_request.breadfundId].votingWindow);
  }

  /// @dev
  function _isSmall(uint256 _autoThreshold, uint256 _withdrawAmount) internal pure returns (bool) {
    return _withdrawAmount <= _autoThreshold;
  }

  /// @dev Return if a specified Breadfund is decommissioned by checking if an owner is set
  function _isDecommissioned(Breadfund memory _breadfund) internal pure returns (bool) {
    return _breadfund.owner == address(0);
  }
}
