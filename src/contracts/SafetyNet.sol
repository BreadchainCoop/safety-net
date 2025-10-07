// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {OwnableUpgradeable} from '@openzeppelin-upgradeable/access/OwnableUpgradeable.sol';
import {IERC20} from '@openzeppelin/token/ERC20/IERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/utils/ReentrancyGuard.sol';

import {ISafetyNet} from '../interfaces/ISafetyNet.sol';

/// @title SafetyNet
/// @notice Simple implementation of a Broodfond for ERC20 tokens
/// @author @exo404
/// @author @valeriooconte
/// @author @RonTuretzky
contract SafetyNet is ISafetyNet, ReentrancyGuard, OwnableUpgradeable {
  /// @notice Number of days in a month (used for calculating monthly withdrawals)
  uint256 public constant DAYS_IN_A_MONTH = 30;

  /// @notice ID counter used to assign unique identifiers to each Safety Net
  uint256 public nextId;

  /// @notice ID counter used to assign unique identifiers to each request
  uint256 public nextIdRequest;

  /// @notice Stores all created Safety Nets indexed by their unique ID
  mapping(uint256 id => SafetyNet safetyNet) public safetyNets;

  /// @notice Indicates whether a specific address is a member of the Safety Net with the given ID
  mapping(uint256 id => mapping(address member => bool status)) public isMember;

  /// @notice Lists all Safety Net IDs that a given member has joined
  mapping(address member => uint256[] ids) public memberSafetyNets;

  /// @notice Tracks personal savings of each member in a given Safety Net
  mapping(uint256 id => mapping(address member => uint256 monthlyContribute)) public safetyNetMemberContribute;

  /// @notice Tracks withdrawable amount for each member in a given Safety Net
  mapping(uint256 id => mapping(address member => uint256 withdrawableBalance)) public memberWithdrawableBalance;

  /// @notice Holds the total balance of each Safety Net
  mapping(uint256 id => uint256 balance) public safetyNetBalance;

  /// @notice Indicates whether a specific ERC20 token is allowed for use in Safety Nets
  mapping(address token => bool status) public allowedTokens;

  /// @notice Tracks whether a member has made their first deposit in a specific Safety Net
  mapping(uint256 id => mapping(address member => bool hasDeposited)) public hasMadeFirstDeposit;

  /// @notice Lists all requests indexed by their unique ID
  mapping(uint256 idReq => Request request) public requests;

  /// @notice Records votes for each request, mapping request ID to member address and their vote status
  mapping(uint256 idReq => mapping(address member => bool status)) public requestVotes;

  /// @notice Tracks if a request has been contested
  mapping(uint256 id => bool contested) public isContested;

  /// @notice Tracks if a request has been executed
  mapping(uint256 id => bool executed) public isExecuted;

  /// @notice Per-epoch cumulative amount deposited by a member (their own savings) toward the exact dues
  mapping(uint256 safetyNetId => mapping(uint256 epochIndex => mapping(address member => uint256))) public
    epochMemberDepositedAmount;

  /// @notice Tracks the number of small withdrawals performed in a Safety Net from a member during one epoch
  mapping(
    uint256 safetyNetId => mapping(uint256 epochIndex => mapping(address member => uint256 smallWithdrawsCount))
  ) public smallWithdrawsCount;

  /// @notice Thrown if a transfer fails
  error TransferFailed();

  /// @dev Require that msg.sender is a member of the given Safety Net
  modifier onlyMemberOf(uint256 _safetyNetId) {
    if (!isMember[_safetyNetId][msg.sender]) revert NotMember();
    _;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /// @inheritdoc ISafetyNet
  function initialize(address _owner) external override initializer {
    __Ownable_init_unchained(_owner);
  }

  /// @inheritdoc ISafetyNet
  function setTokenAllowed(address _token, bool _allowed) external override onlyOwner {
    allowedTokens[_token] = _allowed;
    emit TokenAllowed(_token, _allowed);
  }

  /// @inheritdoc ISafetyNet
  function create(SafetyNet memory _safetyNet) external override nonReentrant returns (uint256 _id) {
    _id = nextId++;

    if (safetyNets[_id].owner != address(0)) revert AlreadyExists();
    if (!allowedTokens[_safetyNet.token]) revert TokenNotAllowed();
    if (_safetyNet.safetyNetStart == 0) revert InvalidSafetyNetStartTime();
    if (_safetyNet.owner == address(0)) revert InvalidOwner();
    if (_safetyNet.initialDeposit <= 0) revert InvalidInitialDeposit();
    if (_safetyNet.fixedDeposit <= 0) revert InvalidFixedDeposit();
    if (_safetyNet.autoThreshold <= 0) revert InvalidThreshold();
    if (_safetyNet.minimumMembers < 2) revert InvalidMinimumMembers();
    if (_safetyNet.maximumMembers < _safetyNet.minimumMembers) revert InvalidMaximumMembers();
    if (_safetyNet.epochDuration == 0) revert InvalidEpochDuration();
    if (_safetyNet.smallWithdrawsLimit == 0) revert InvalidSmallWithdrawsLimit();

    uint256 _safetyNetMembersLength = _safetyNet.members.length;

    for (uint256 i = 0; i < _safetyNetMembersLength; i++) {
      address _member = _safetyNet.members[i];
      if (_member == address(0)) revert InvalidMemberAddress();
      for (uint256 j = 0; j < i; j++) {
        if (_safetyNet.members[j] == _member) {
          revert DuplicateMember();
        }
      }
    }

    for (uint256 i = 0; i < _safetyNetMembersLength; i++) {
      address _member = _safetyNet.members[i];
      isMember[_id][_member] = true;
      memberSafetyNets[_member].push(_id);
    }

    _safetyNet.id = _id;
    safetyNets[_id] = _safetyNet;

    emit SafetyNetCreated(
      _id,
      _safetyNet.minimumMembers,
      _safetyNet.maximumMembers,
      _safetyNet.consensusThreshold,
      _safetyNet.members,
      _safetyNet.token,
      _safetyNet.initialDeposit,
      _safetyNet.fixedDeposit,
      _safetyNet.ratio,
      _safetyNet.autoThreshold,
      _safetyNet.epochDuration,
      _safetyNet.smallWithdrawsLimit
    );
    return _id;
  }

  /// @inheritdoc ISafetyNet
  function decommission(uint256 _id) external override nonReentrant {
    SafetyNet memory _safetyNet = safetyNets[_id];
    uint256 _safetyNetMembersLength = _safetyNet.members.length;

    if (!isDecommissionable(_id)) revert NotDecommissionable();

    uint256 _balance = safetyNetBalance[_id];

    safetyNetBalance[_id] = 0;

    for (uint256 i = 0; i < _safetyNetMembersLength; i++) {
      address _member = _safetyNet.members[i];
      uint256 _amount = memberWithdrawableBalance[_id][_member];
      if (_amount > 0) {
        memberWithdrawableBalance[_id][_member] = 0;
        _balance -= _amount;

        if (!IERC20(_safetyNet.token).transfer(_member, _amount)) revert TransferFailed();
      }
    }

    if (_balance > 0) {
      uint256 _amount = _balance / _safetyNetMembersLength;

      for (uint256 i = 0; i < _safetyNetMembersLength; i++) {
        address _member = _safetyNet.members[i];
        if (!IERC20(_safetyNet.token).transfer(_member, _amount)) revert TransferFailed();
      }
    }

    delete safetyNets[_id];

    emit SafetyNetDecommissioned(_id);
  }

  /// @inheritdoc ISafetyNet
  function deposit(uint256 _id, uint256 _value) external override nonReentrant {
    _deposit(_id, _value, msg.sender);
  }

  /// @inheritdoc ISafetyNet
  function depositFor(uint256 _id, uint256 _value, address _member) external override nonReentrant {
    _deposit(_id, _value, _member);
  }

  /// @inheritdoc ISafetyNet
  function withdraw(uint256 _id, uint256 _daysRequested) external override nonReentrant {
    _withdraw(_id, msg.sender, _daysRequested);
  }

  /// @inheritdoc ISafetyNet
  function createRequest(Request memory _request)
    external
    override
    onlyMemberOf(_request.safetyNetId)
    returns (uint256)
  {
    if (_request.owner != msg.sender) revert InvalidOwner();
    if (safetyNets[_request.safetyNetId].owner == address(0)) revert NotCommissioned();
    if (_request.amount == 0) revert InvalidRequest();

    _request.timestamp = block.timestamp;
    _request.yesVotes = 0;
    _request.noVotes = 0;

    return _createRequest(_request);
  }

  /// @inheritdoc ISafetyNet
  function contest(uint256 _requestId) external override nonReentrant onlyMemberOf(requests[_requestId].safetyNetId) {
    Request storage _request = requests[_requestId];

    if (!_isContestable(_requestId)) revert ContestWindowClosed();
    if (isContested[_requestId]) revert AlreadyContested();

    isContested[_requestId] = true;

    emit WithdrawalContested(_requestId, _request.owner, block.timestamp);
  }

  /// @inheritdoc ISafetyNet
  function executeContestedWithdrawal(uint256 _idRequest) external override nonReentrant {
    Request memory _request = requests[_idRequest];
    if (isExecuted[_idRequest]) revert AlreadyExecuted();

    SafetyNet memory _safetyNet = safetyNets[_request.safetyNetId];

    // Can only auto-execute if contest window has passed and request was not contested
    if (!_isContestable(_idRequest) && !isContested[_idRequest]) {
      _deduct(_request.safetyNetId, _request.owner, _request.amount);

      isExecuted[_idRequest] = true;
      emit WithdrawalAutoExecuted(_idRequest, _request.owner, _request.amount);

      if (!IERC20(_safetyNet.token).transfer(_request.owner, _request.amount)) revert TransferFailed();
    }
  }

  function vote(uint256 _requestId, bool _vote) external override nonReentrant {
    if (!isMember[requests[_requestId].safetyNetId][msg.sender]) revert NotMember();
    if (requestVotes[_requestId][msg.sender]) revert AlreadyVoted();
    if (!_isVotingOngoing(_requestId)) revert VotingWindowClosed();
    if (isExecuted[_requestId]) revert AlreadyExecuted();

    if (_vote) {
      requests[_requestId].yesVotes++;
    } else {
      requests[_requestId].noVotes++;
    }
    requestVotes[_requestId][msg.sender] = true;
    emit Voted(_requestId, msg.sender, _vote);

    // Check if consensus has been reached after this vote
    Request memory _request = requests[_requestId];
    SafetyNet memory _safetyNet = safetyNets[_request.safetyNetId];

    if (_request.yesVotes > _safetyNet.members.length * _safetyNet.consensusThreshold / 100) {
      // Consensus reached - execute withdrawal immediately
      _deduct(_request.safetyNetId, _request.owner, _request.amount);

      isExecuted[_requestId] = true;
      emit WithdrawalApproved(_requestId, _request.owner, _request.amount);
      if (!IERC20(_safetyNet.token).transfer(_request.owner, _request.amount)) revert TransferFailed();
    }
  }
  /// @inheritdoc ISafetyNet

  function isTokenAllowed(address _token) external view override returns (bool) {
    return allowedTokens[_token];
  }

  /// @inheritdoc ISafetyNet
  function getSafetyNet(uint256 _id) external view override returns (SafetyNet memory _safetyNet) {
    _safetyNet = safetyNets[_id];

    if (_isDecommissioned(_safetyNet)) revert NotCommissioned();
  }

  /// @inheritdoc ISafetyNet
  function getSafetyNets(uint256[] calldata _ids) external view override returns (SafetyNet[] memory _safetyNets) {
    _safetyNets = new SafetyNet[](_ids.length);

    for (uint256 i = 0; i < _ids.length; i++) {
      _safetyNets[i] = safetyNets[_ids[i]];
    }
  }

  /// @inheritdoc ISafetyNet
  function getMemberSafetyNets(address _member) external view override returns (uint256[] memory _ids) {
    return memberSafetyNets[_member];
  }

  /// @inheritdoc ISafetyNet
  function getMemberBalances(uint256 _id)
    external
    view
    override
    returns (address[] memory _members, uint256[] memory _balances)
  {
    SafetyNet memory _safetyNet = safetyNets[_id];

    if (_isDecommissioned(_safetyNet)) revert NotCommissioned();

    _balances = new uint256[](_safetyNet.members.length);
    for (uint256 i = 0; i < _safetyNet.members.length; i++) {
      _balances[i] = memberWithdrawableBalance[_id][_safetyNet.members[i]];
    }

    return (_safetyNet.members, _balances);
  }

  /// @inheritdoc ISafetyNet
  function hasMemberDepositedInEpoch(
    uint256 _safetyNetId,
    address _member,
    uint256 _epochIndex
  ) external view override returns (bool) {
    ISafetyNet.SafetyNet storage sn = safetyNets[_safetyNetId];
    if (sn.owner == address(0)) return false;
    return epochMemberDepositedAmount[_safetyNetId][_epochIndex][_member] >= sn.fixedDeposit;
  }

  /// @inheritdoc ISafetyNet
  function duesRemainingThisEpoch(uint256 _id, address _member) external view override returns (uint256) {
    uint256 epochIndex = getCurrentEpochIndex(_id);
    uint256 paid = epochMemberDepositedAmount[_id][epochIndex][_member];
    uint256 target = safetyNets[_id].fixedDeposit;
    return paid >= target ? 0 : (target - paid);
  }

  /// @inheritdoc ISafetyNet
  function getCurrentEpochIndex(uint256 _safetyNetId) public view override returns (uint256) {
    SafetyNet memory safetyNet = safetyNets[_safetyNetId];

    if (block.timestamp < safetyNet.safetyNetStart) {
      return 0;
    }

    return (block.timestamp - safetyNet.safetyNetStart) / safetyNet.epochDuration;
  }

  /// @inheritdoc ISafetyNet
  function isDecommissionable(uint256 _safetyNetId) public view override returns (bool) {
    SafetyNet memory safetyNet = safetyNets[_safetyNetId];

    if (safetyNet.owner == address(0)) {
      return true;
    }

    uint256 currentEpochIndex = getCurrentEpochIndex(_safetyNetId);

    for (uint256 epochIndex = 0; epochIndex < currentEpochIndex; epochIndex++) {
      for (uint256 i = 0; i < safetyNet.members.length; i++) {
        address m = safetyNet.members[i];
        if (epochMemberDepositedAmount[_safetyNetId][epochIndex][m] < safetyNet.fixedDeposit) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * @dev Make a deposit for monthly contribute
   *      If it's the first deposit, initialDeposit is the total amount
   *      The method "transferFrom()" requires "approve()" front-end side
   *      Each epoch after initial deposit, a member must pay exactly `fixedDeposit`.
   *      Partial deposits are allowed until the epoch sum == fixedDeposit.
   */
  function _deposit(uint256 _id, uint256 _value, address _member) internal {
    SafetyNet storage sn = safetyNets[_id];

    if (sn.owner == address(0)) revert NotCommissioned();
    if (!isMember[_id][_member]) revert NotMember();
    if (block.timestamp < sn.safetyNetStart) revert DepositBeforeSafetyNetStart();
    if (_value == 0) revert InvalidDepositAmount();

    uint256 epoch = getCurrentEpochIndex(_id);
    bool initialDone = hasMadeFirstDeposit[_id][_member];

    uint256 epochPaid = epochMemberDepositedAmount[_id][epoch][_member];

    if (!initialDone) {
      uint256 initial = sn.initialDeposit;
      // First month: must be first payment in the epoch AND exactly initialDeposit (no partials/multi-tx)
      if (epochPaid != 0 || _value != initial) revert InvalidDepositAmount();

      hasMadeFirstDeposit[_id][_member] = true;
      safetyNetMemberContribute[_id][_member] = sn.fixedDeposit;

      // Set epoch paid to full initial
      epochPaid = initial;
    } else {
      // Subsequent months: partials allowed up to fixedDeposit
      if (epochPaid + _value > sn.fixedDeposit) revert ExceedsDepositAmount();
      epochPaid += _value;
    }

    safetyNetBalance[_id] += _value;
    memberWithdrawableBalance[_id][_member] += _value * sn.ratio;
    epochMemberDepositedAmount[_id][epoch][_member] = epochPaid;

    if (!IERC20(sn.token).transferFrom(_member, address(this), _value)) revert TransferFailed();

    emit FundsDeposited(_id, _member, _value);
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
    if (safetyNets[_request.safetyNetId].owner == address(0)) revert NotCommissioned();

    requests[_idRequest] = _request;

    emit RequestCreated(_idRequest, _request.owner, _request.timestamp, _request.amount);
    return _idRequest;
  }

  /**
   * @dev Make a withdrawal
   * @param _id The ID of the Safety Net
   * @param _member The address of the member making the withdrawal
   * @param _daysRequested The number of days for which the member is requesting a withdrawal
   * @notice If the requested amount is small, it is transferred directly to the member
   *         If the requested amount is large, a request is created for approval
   */
  function _withdraw(uint256 _id, address _member, uint256 _daysRequested) internal {
    SafetyNet memory _safetyNet = safetyNets[_id];
    uint256 currentEpochIndex = getCurrentEpochIndex(_id);

    if (_safetyNet.owner == address(0)) revert NotCommissioned();
    if (!isMember[_id][_member]) revert NotMember();

    uint256 _dailyWithdrawableAmount = _getDailyWithdrawableAmount(_id, _member, _safetyNet.ratio);

    uint256 _withdrawAmount = _dailyWithdrawableAmount * _daysRequested;

    if (_withdrawAmount > memberWithdrawableBalance[_id][_member]) revert NotWithdrawable();

    if (_isSmall(_safetyNet.autoThreshold, _withdrawAmount)) {
      smallWithdrawsCount[_id][currentEpochIndex][_member]++;
      if (smallWithdrawsCount[_id][currentEpochIndex][_member] > _safetyNet.smallWithdrawsLimit) {
        revert ExceedsSmallWithdrawalLimit();
      }
      memberWithdrawableBalance[_id][_member] -= _withdrawAmount;
      safetyNetBalance[_id] -= _withdrawAmount;
      if (!IERC20(_safetyNet.token).transfer(_member, _withdrawAmount)) revert TransferFailed();

      emit FundsWithdrawn(_id, _member, _withdrawAmount);
    } else {
      Request memory _request = Request({
        owner: _member, safetyNetId: _id, timestamp: block.timestamp, yesVotes: 0, noVotes: 0, amount: _withdrawAmount
      });
      uint256 _idRequest = _createRequest(_request);
      emit WithdrawalPending(_idRequest, _member, _withdrawAmount);
    }
  }

  /// @dev Calculates the daily withdrawal for a member in a Safety Net
  function _getDailyWithdrawableAmount(uint256 _id, address _member, uint256 _ratio) internal view returns (uint256) {
    uint256 _memberContribute = safetyNetMemberContribute[_id][_member];
    uint256 _monthlyWithdrawalAmount = _memberContribute * _ratio;
    return _monthlyWithdrawalAmount / DAYS_IN_A_MONTH;
  }

  /// @dev Check if a request is contestable by comparing the current timestamp with the request's timestamp and the contest window
  function _isContestable(uint256 _idRequest) internal view returns (bool) {
    Request memory _request = requests[_idRequest];
    return block.timestamp <= (_request.timestamp + safetyNets[_request.safetyNetId].contestWindow);
  }

  /// @dev Check if a request's voting window is open by comparing the current timestamp with the request's timestamp and the voting window
  function _isVotingOngoing(uint256 _idRequest) internal view returns (bool) {
    Request memory _request = requests[_idRequest];
    return block.timestamp <= (_request.timestamp + safetyNets[_request.safetyNetId].votingWindow);
  }

  /// @dev
  function _isSmall(uint256 _autoThreshold, uint256 _withdrawAmount) internal pure returns (bool) {
    return _withdrawAmount <= _autoThreshold;
  }

  /// @dev Return if a specified Safety Net is decommissioned by checking if an owner is set
  function _isDecommissioned(SafetyNet memory _safetyNet) internal pure returns (bool) {
    return _safetyNet.owner == address(0);
  }

  /// @dev Deducts `_amount` from a member’s withdrawable balance and the Safety Net’s total balance.
  ///      Reverts with `NotWithdrawable` if balance is insufficient.
  function _deduct(uint256 _safetyNetId, address _member, uint256 _amount) private {
    if (memberWithdrawableBalance[_safetyNetId][_member] < _amount) {
      revert NotWithdrawable();
    }
    memberWithdrawableBalance[_safetyNetId][_member] -= _amount;
    safetyNetBalance[_safetyNetId] -= _amount;
  }
}
