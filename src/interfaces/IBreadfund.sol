// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IBreadfund {
  /*///////////////////////////////////////////////////////////////
                            STRUCTS
  //////////////////////////////////////////////////////////////*/

  struct Request {
    address owner;
    uint256 breadfundId;
    uint256 timestamp;
    string url;
    uint256 yesVotes;
    uint256 noVotes;
  }

  struct Breadfund {
    address owner;
    uint256 breadfundStart;
    address token;
    address[] members;
    uint256 initialDeposit;
    uint256 fixedDeposit;
    uint256 depositInterval;
    uint256 maxWithdraws;
  }

  /*///////////////////////////////////////////////////////////////
                            EVENTS
  //////////////////////////////////////////////////////////////*/

  event BreadfundCreated(
    uint256 indexed id, address[] members, address token, uint256 initialDeposit, 
    uint256 depositInterval, uint256 fixedDeposit, uint256 maxwithdraws
  );
  event BreadfundDecommissioned(uint256 indexed id);
  event BreadfundDeposited(uint256 indexed id, address indexed member, uint256 amount);
  event BreadfundWithdrawn(uint256 indexed id, address indexed member, uint256 amount);
  event TokenAllowed(address indexed token, bool indexed allowed);

  event RequestCreated(uint256 indexed id, address owner, uint256 timestamp, string url);
  event RequestEnded(uint256 indexed id, uint256 yesVotes, uint256 noVotes);

  event Voted(uint256 indexed requestId, address indexed voter, bool vote);

  /*///////////////////////////////////////////////////////////////
                            ERRORS
  //////////////////////////////////////////////////////////////*/

  error AlreadyDeposited();
  error AlreadyExists();
  error InvalidDeposit();
  error InvalidBreadfund();
  error NotCommissioned();
  error NotMember();
  error NotDecommissionable();
  error NotWithdrawable();
  error TransferFailed();
  error DepositWindowClosed();
  error BreadfundExpired();
  error ExceedsDepositAmount();
  error DepositBeforeBreadfundStart();
  error TokenNotAllowed();
  error InvalidDepositInterval();
  error InvalidDepositAmount();
  error InvalidBreadfundStartTime();
  error InvalidCurrentIndex();
  error InvalidOwner();
  error InvalidMemberCount();
  error InvalidMemberAddress();

  //Breadfunds specific errors
  error InvalidInitialDeposit();
  error InvalidFixedDeposit();
  error InvalidMaxWithdraws();
  error InvalidRequest();
  error AlreadyVoted();
  error NotAllVoted();
  error MaxWithdrawsReached();


  /*///////////////////////////////////////////////////////////////
                            VIEW
  //////////////////////////////////////////////////////////////*/

  function setTokenAllowed(address _token, bool _allowed) external;
  function create(Breadfund memory breadfund) external returns (uint256);
  function decommission(uint256 id) external;
  function deposit(uint256 id, uint256 value) external;

  function createRequest(Request memory request) external returns (uint256);
  function endRequest(uint256 requestId) external;
  function vote(uint256 requestId, bool voteValue) external;

  /*///////////////////////////////////////////////////////////////
                            VIEW
  //////////////////////////////////////////////////////////////*/

  function getBreadfund(uint256 id) external view returns (Breadfund memory);
  function getBreadfunds(uint256[] calldata ids) external view returns (Breadfund[] memory);
  function getMemberBreadfunds(address member) external view returns (uint256[] memory);
  function getMemberBalances(uint256 id) external view returns (address[] memory, uint256[] memory);
  function checkMemberships(address member, uint256[] calldata ids) external view returns (bool[] memory);
  function isTokenAllowed(address token) external view returns (bool);
  function isWithdrawable(uint256 id) external view returns (bool);
  function withdrawableBy(uint256 id) external view returns (address);
}
