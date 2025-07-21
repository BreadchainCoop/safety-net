// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Breadfund Collective Savings Contract Interface
/// @notice This interface defines the structure and interaction logic for Breadfunds, a group savings and voting system.
/// @dev All function inputs/outputs are documented via NatSpec for external visibility.
/// @author @exo404
/// @author @valeriooconte
/// @author @RonTuretzky
interface IBreadfund {
  /*///////////////////////////////////////////////////////////////
                            STRUCTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Struct defining a Breadfund group
  /// @param id Unique identifier for the Breadfund
  /// @param owner The creator of the Breadfund
  /// @param minimumMembers Minimum number of members required to create a Breadfund
  /// @param maximumMembers Maximum number of members allowed in the Breadfund
  /// @param consensusThreshold Percentage of members required to approve a request
  /// @param breadfundStart Timestamp when the fund becomes active
  /// @param token The ERC20 token used for deposits and withdrawals
  /// @param members List of member addresses
  /// @param initialDeposit Initial deposit required to join
  /// @param fixedDeposit Fixed deposit fee amount
  /// @param contestWindow Duration of the contest period for requests
  /// @param votingWindow Duration of the voting period for requests
  struct Breadfund {
    uint256 id;
    address owner;
    uint256 minimumMembers;
    uint256 maximumMembers;
    uint256 consensusThreshold;
    uint256 breadfundStart;
    address token;
    address[] members;
    uint256 initialDeposit;
    uint256 fixedDeposit;
    uint256 ratio;
    uint256 autoThreshold;
    uint256 contestWindow;
    uint256 votingWindow;
  }

  /// @notice Struct defining a withdraw request within a Breadfund
  /// @param owner The request initiator
  /// @param breadfundId ID of the related Breadfund
  /// @param timestamp Creation time of the request
  /// @param yesVotes Number of yes votes received
  /// @param noVotes Number of no votes received
  /// @param amount Amount requested for withdrawal
  struct Request {
    address owner;
    uint256 breadfundId;
    uint256 timestamp;
    uint256 yesVotes;
    uint256 noVotes;
    uint256 amount;
  }

  /*///////////////////////////////////////////////////////////////
                            EVENTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Emitted when a new Breadfund is created
  event BreadfundCreated(
    uint256 indexed id,
    uint256 minimumMembers,
    uint256 maximumMembers,
    uint256 consensusThreshold,
    address[] members,
    address token,
    uint256 initialDeposit,
    uint256 fixedDeposit,
    uint256 ratio,
    uint256 autoThreshold
  );

  /// @notice Emitted when a Breadfund is decommissioned
  event BreadfundDecommissioned(uint256 indexed id);

  /// @notice Emitted when a member deposits to a Breadfund
  event FundsDeposited(uint256 indexed id, address indexed member, uint256 amount);

  /// @notice Emitted when a member withdraws from a Breadfund
  event FundsWithdrawn(uint256 indexed id, address indexed member, uint256 amount);

  /// @notice Emitted when a token is allowed or disallowed for Breadfund use
  event TokenAllowed(address indexed token, bool indexed allowed);

  /// @notice Emitted when a new request is created
  event RequestCreated(uint256 indexed id, address owner, uint256 timestamp, uint256 amount);

  /// @notice Emitted when voting on a request is completed
  event RequestEnded(uint256 indexed id, uint256 yesVotes, uint256 noVotes);

  /// @notice Emitted when a vote is cast on a request
  event Voted(uint256 indexed requestId, address indexed voter, bool vote);

  /// @notice Emitted when a withdraw request is pending
  event WithdrawalPending(uint256 indexed requestId, address indexed owner, uint256 amount);

  /// @notice Emitted when a request is contested
  event WithdrawalContested(uint256 indexed requestId, address indexed owner, uint256 timestamp);

  /// @notice Emitted when a request is auto-executed after contest period
  event WithdrawalAutoExecuted(uint256 indexed requestId, address indexed owner, uint256 amount);

  /// @notice Emitted when a request is approved and funds are withdrawn
  event WithdrawalApproved(uint256 indexed requestId, address indexed owner, uint256 timestamp);

  /// @notice Emitted when a request is rejected and funds are withdrawn
  event WithdrawalRejected(uint256 indexed requestId, address indexed owner, uint256 timestamp);

  /*///////////////////////////////////////////////////////////////
                            ERRORS
  //////////////////////////////////////////////////////////////*/

  /// @notice Thrown when the minimum members is less than 2
  error InvalidMinimumMembers();

  /// @notice Thrown when the maximum members is less than the minimum members
  error InvalidMaximumMembers();

  /// @notice Thrown when a deposit has already been made for the period
  error AlreadyDeposited();

  /// @notice Thrown when trying to create a duplicate Breadfund
  error AlreadyExists();

  /// @notice Thrown when the Breadfund ID is not found
  error InvalidBreadfund();

  /// @notice Thrown if the fund is not in an active state
  error NotCommissioned();

  /// @notice Thrown if the user is not a Breadfund member
  error NotMember();

  /// @notice Thrown if the Breadfund cannot be decommissioned yet
  error NotDecommissionable();

  /// @notice Thrown if the Breadfund cannot be withdrawn from
  error NotWithdrawable();

  /// @notice Thrown when the deposit window is closed
  error DepositWindowClosed();

  /// @notice Thrown when the Breadfund has expired
  error BreadfundExpired();

  /// @notice Thrown when the deposit exceeds allowed limits
  error ExceedsDepositAmount();

  /// @notice Thrown if attempting to deposit before the fund starts
  error DepositBeforeBreadfundStart();

  /// @notice Thrown if the specified token is not whitelisted
  error TokenNotAllowed();

  /// @notice Thrown for deposit amounts that do not match requirements
  error InvalidDepositAmount();

  /// @notice Thrown for an invalid Breadfund start time
  error InvalidBreadfundStartTime();

  /// @notice Thrown when indexing fails
  error InvalidCurrentIndex();

  /// @notice Thrown when caller is not the owner
  error InvalidOwner();

  /// @notice Thrown if not enough members are added
  error InvalidMemberCount();

  /// @notice Thrown if a member address is invalid
  error InvalidMemberAddress();

  /// @notice Thrown for bad initial deposit configuration
  error InvalidInitialDeposit();

  /// @notice Thrown for bad fixed deposit configuration
  error InvalidFixedDeposit();

  /// @notice Thrown when `maxWithdraws` is invalid
  error InvalidMaxWithdraws();

  /// @notice Thrown when `autoThreshold` is invalid
  error InvalidThreshold();

  /// @notice Thrown for invalid request
  error InvalidRequest();

  /// @notice Thrown if a voter has already voted
  error AlreadyVoted();

  /// @notice Thrown if the request is already contested
  error AlreadyContested();

  /// @notice Thrown if the request has already been executed
  error AlreadyExecuted();

  /// @notice Thrown if not all required votes have been cast
  error NotAllVoted();

  /// @notice Thrown if the request is not contestable
  error ContestWindowClosed();

  /// @notice Thrown if the request is not votable
  error VotingWindowClosed();

  /*///////////////////////////////////////////////////////////////
                            EXTERNAL
  //////////////////////////////////////////////////////////////*/

  /// @notice Initializes the Breadfund interface for an owner
  /// @param owner The address that will control the Breadfund
  function initialize(address owner) external;

  /// @notice Toggles whether a token is allowed for use in Breadfunds
  /// @param token The ERC20 token address
  /// @param allowed Whether the token is allowed or not
  function setTokenAllowed(address token, bool allowed) external;

  /// @notice Creates a new Breadfund
  /// @param breadfund The Breadfund configuration
  /// @return id The unique ID of the newly created Breadfund
  function create(Breadfund memory breadfund) external returns (uint256);

  /// @notice Decommissions an existing Breadfund
  /// @param id ID of the Breadfund to decommission
  function decommission(uint256 id) external;

  /// @notice Makes a deposit into a Breadfund
  /// @param id The Breadfund ID
  /// @param value Amount to deposit
  function deposit(uint256 id, uint256 value) external;

  /// @notice Makes a deposit into a Breadfund for another member
  /// @param id The Breadfund ID
  /// @param value Amount to deposit
  /// @param member The member address making the deposit
  function depositFor(uint256 id, uint256 value, address member) external;

  /// @notice Makes a withdrawal from a Breadfund
  /// @param id The Breadfund ID
  /// @param daysRequested Number of days for calculating withdrawal amount
  function withdraw(uint256 id, uint256 daysRequested) external;

  /// @notice Creates a new request for withdraw from a Breadfund
  /// @param request The withdraw request details
  /// @return id The request ID
  function createRequest(Request memory request) external returns (uint256);

  /// @notice Contests a request
  /// @param requestId The ID of the request to contest
  function contest(uint256 requestId) external;

  /// @notice Checks if a request can be contested
  /// @param requestId The ID of the request to check
  function executeWithdrawal(uint256 requestId) external;

  /// @notice Casts a vote on a request
  /// @param requestId The ID of the request
  /// @param voteValue True for yes, false for no
  function vote(uint256 requestId, bool voteValue) external;

  /// @notice Checks if a request can be voted on
  /// @param requestId The ID of the request to check
  function checkVotingWindow(uint256 requestId) external;

  /*///////////////////////////////////////////////////////////////
                            VIEW
  //////////////////////////////////////////////////////////////*/

  /// @notice Retrieves a single Breadfund by ID
  /// @param id The Breadfund ID
  /// @return breadfund The Breadfund struct
  function getBreadfund(uint256 id) external view returns (Breadfund memory);

  /// @notice Retrieves multiple Breadfunds by IDs
  /// @param ids Array of Breadfund IDs
  /// @return breadfunds Array of Breadfund structs
  function getBreadfunds(uint256[] calldata ids) external view returns (Breadfund[] memory);

  /// @notice Returns all Breadfunds a member is part of
  /// @param member Address of the member
  /// @return ids List of Breadfund IDs the member has joined
  function getMemberBreadfunds(address member) external view returns (uint256[] memory);

  /// @notice Gets the balances of each member in a Breadfund
  /// @param id Breadfund ID
  /// @return members Array of member addresses
  /// @return balances Array of corresponding balances
  function getMemberBalances(uint256 id) external view returns (address[] memory members, uint256[] memory balances);

  /// @notice Checks if a token is allowed
  /// @param token ERC20 token address
  /// @return allowed True if the token is allowed, false otherwise
  function isTokenAllowed(address token) external view returns (bool);
}
