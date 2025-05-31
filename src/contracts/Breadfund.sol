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
  uint256 public nextIdRequest;

  mapping(uint256 id => Breadfund breadfund) public breadfunds;
  mapping(uint256 id => mapping(address member => bool status)) public isMember;
  mapping(address member => uint256[] ids) public memberBreadfunds;
  mapping(uint256 id => mapping(address member => uint256 withdrawals)) public breadfundMemberWithdrawals;
  mapping(uint256 id => mapping(address member => uint256 contribute)) public breadfundMemberContribute;
  mapping(uint256 id => mapping(address member => bool status)) public breadfundMonthPayed;
  mapping(uint256 id => uint256 balance) public breadfundBalance;
  mapping(address token => bool status) public allowedTokens;

  mapping (uint256 idReq => Request request) public requests;
  mapping (uint256 idReq => mapping (address member => bool status)) public requestVotes;
  // DIFFERENZA DA NON PAGARE IN CASO DI RICHIESTA NON COMMISSIONED
  mapping(uint256 id => mapping(address member => uint256 balance)) public balances;

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

    emit BreadfundCreated(_id, _breadfund.members, _breadfund.token, _breadfund.initialDeposit, _breadfund.depositInterval, _breadfund.fixedDeposit, _breadfund.maxWithdraws);
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
      uint256 _amount = breadfundMemberContribute[_id][_member]/_totalDeposits * breadfundBalance[_id];
      if (_amount > 0) {
        bool success = IERC20(_breadfund.token).transfer(_member, _amount);
        if (!success) revert TransferFailed();
      }
    }

    delete breadfunds[_id];
    emit BreadfundDecommissioned(_id);
  }

  function createRequest(Request memory _request) external override nonReentrant returns (uint256 _id) {

    // AGGIORNIAMO I PRELIEVVI?
    if (breadfundMemberWithdrawals[_request.breadfundId][_request.owner] == 24) revert MaxWithdrawsReached();

    uint256 _idRequest = nextIdRequest++;

    if (requests[_idRequest].owner != address(0) ) revert AlreadyExists();
    if (breadfunds[_request.breadfundId].owner == address(0)) revert InvalidBreadfund();
    if (!isMember[_request.breadfundId][_request.owner]) revert NotMember();

    requests[_idRequest] = _request;
    requests[_idRequest].timestamp = block.timestamp;

    emit RequestCreated(_idRequest, _request.owner, _request.timestamp, _request.url);
    return _idRequest;
  }

  function vote(uint256 _requestId, bool _vote) external override nonReentrant {

    if (requests[_requestId].owner == address(0)) revert InvalidRequest();
    if (!isMember[requests[_requestId].breadfundId][msg.sender]) revert NotMember();
    if (requestVotes[_requestId][msg.sender]) revert AlreadyVoted();

    if (_vote) {
      requests[_requestId].yesVotes++;
    } else {
      requests[_requestId].noVotes++;
    }
    requestVotes[_requestId][msg.sender] = true;
  }

  function endRequest(uint256 _requestId) external override nonReentrant {
    Request memory _request = requests[_requestId];
    if (_request.owner == address(0)) revert InvalidRequest();
    if (!_allVoted(_requestId)) revert NotAllVoted();

    Breadfund memory _breadfund = breadfunds[requests[_requestId].breadfundId];

    if (_request.yesVotes > _breadfund.members.length / 2) {
      uint256 _amount = breadfundMemberContribute[_request.breadfundId][_request.owner]*200/9;  // FISSIAMO I FIXED E INIZIAL DEPOSITS?
      address _token = _breadfund.token;
      if (_amount > 0)
      {
        bool _success = IERC20(_token).transfer(_request.owner, _amount);
        if (!_success) revert TransferFailed();
      }
    }

    breadfundMemberWithdrawals[_request.breadfundId][_request.owner]++;

    delete requests[_requestId];

    emit RequestEnded(_requestId, _request.yesVotes, _request.noVotes);
  }
  /// @inheritdoc IBreadfund
  function isTokenAllowed(address _token) external view override returns (bool) {
    return allowedTokens[_token];
  }
  
  /// Deve essere view?
  function _allVoted(uint256 _requestId) internal returns (bool) {
    if (requests[_requestId].owner == address(0)) revert InvalidRequest();
    bool _status = true;
    Breadfund memory _breadfund = breadfunds[requests[_requestId].breadfundId];
      for (uint256 i = 0; i < _breadfund.members.length; i++) {
          if (!requestVotes[_requestId][_breadfund.members[i]]) {
              _status = false;
              break;
          }
      }
      return _status;
  }

}
