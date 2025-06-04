// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IBreadfonds {
  /*///////////////////////////////////////////////////////////////
                            STRUCTS
  //////////////////////////////////////////////////////////////*/

  struct Breadfonds {
    address owner;
    string name;
    address token;
    uint256 initialDeposit;
    uint256 fixedDeposit;
    uint256 depositInterval;
    uint256 maxWithdraws;
    address[] members;
    uint256[] depositAmount;
    uint256 breadfondStart;
  }

  /*///////////////////////////////////////////////////////////////
                            EVENTS
  //////////////////////////////////////////////////////////////*/

  event BreadfondsCreated(
    uint256 indexed id, address[] members, address token, uint256 initialDeposit, 
    uint256 depositInterval, uint256 fixedDeposit, uint256 maxwithdraws
  );
  event BreadfondsDecommissioned(uint256 indexed id);
  event BreadfondsDeposited(uint256 indexed id, address indexed member, uint256 amount);
  event BreadfondsWithdrawn(uint256 indexed id, address indexed member, uint256 amount);
  event TokenAllowed(address indexed token, bool indexed allowed);

  /*///////////////////////////////////////////////////////////////
                            ERRORS
  //////////////////////////////////////////////////////////////*/

  error AlreadyDeposited();
  error AlreadyExists();
  error InvalidDeposit();
  error InvalidBroodfonds();
  error NotCommissioned();
  error NotMember();
  error NotDecommissionable();
  error NotWithdrawable();
  error TransferFailed();
  error DepositWindowClosed();
  error BreadfondsExpired();
  error ExceedsDepositAmount();
  error DepositBeforeBreadfondsStart();
  error TokenNotAllowed();
  error InvalidDepositInterval();
  error InvalidDepositAmount();
  error InvalidBreadfondsStartTime();
  error InvalidCurrentIndex();
  error InvalidOwner();
  error InvalidMemberCount();
  error InvalidMemberAddress();

  //Broodfonds specific errors
  error InvalidInitialDeposit();
  error InvalidFixedDeposit();
  error InvalidMaxWithdraws();


// DA RIVEDERE QUESTE FUNZIONI

  /*///////////////////////////////////////////////////////////////
                            VIEW
  //////////////////////////////////////////////////////////////*/

  function initialize(address owner) external;
  function setTokenAllowed(address token, bool allowed) external;
  function create(Breadfonds memory fond) external returns (uint256);
  function deposit(uint256 id, uint256 value) external;
  function withdraw(uint256 id) external;
  function withdrawable(uint256 id) external returns (bool);
  function decommission(uint256 id) external;
  function vote(uint256 id) external returns (bool);

  /*///////////////////////////////////////////////////////////////
                            VIEW
  //////////////////////////////////////////////////////////////*/

  function getBreadfonds(uint256 id) external view returns (Breadfonds memory);
  function getBreadfonds(uint256[] calldata ids) external view returns (Breadfonds[] memory);
  function getMemberBreadfonds(address member) external view returns (uint256[] memory);
  function getMemberBalances(uint256 id) external view returns (address[] memory, uint256[] memory);
  function checkMemberships(address member, uint256[] calldata ids) external view returns (bool[] memory);
  function isTokenAllowed(address token) external view returns (bool);
  function isWithdrawable(uint256 id) external view returns (bool);
  function withdrawableBy(uint256 id) external view returns (address);
}
