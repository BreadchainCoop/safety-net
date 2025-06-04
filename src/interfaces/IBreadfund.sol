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
  /// @param owner The creator of the Breadfund
  /// @param breadfundStart Timestamp when the fund becomes active
  /// @param token The ERC20 token used for deposits and withdrawals
  /// @param members List of member addresses
  /// @param initialDeposit Initial deposit required to join
  /// @param fixedDeposit Fixed deposit fee amount
  /// @param depositInterval Minimum time between deposits
  /// @param maxWithdraws Max allowed withdrawals during fund's lifetime
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

  /// @notice Struct defining a withdraw request within a Breadfund
  /// @param owner The request initiator
  /// @param breadfundId ID of the related Breadfund
  /// @param timestamp Creation time of the request
  /// @param yesVotes Number of yes votes received
  /// @param noVotes Number of no votes received
  struct Request {
    address owner;
    uint256 breadfundId;
    uint256 timestamp;
    uint256 yesVotes;
    uint256 noVotes;
  }

  /*///////////////////////////////////////////////////////////////
                            EVENTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Emitted when a new Breadfund is created
  event BreadfundCreated(
    uint256 indexed id,
    address[] members,
    address token,
    uint256 initialDeposit,
    uint256 depositInterval,
    uint256 fixedDeposit,
    uint256 maxwithdraws
  );

  /// @notice Emitted when a Breadfund is decommissioned
  event BreadfundDecommissioned(uint256 indexed id);

  /// @notice Emitted when a member deposits to a Breadfund
  event BreadfundDeposited(uint256 indexed id, address indexed member, uint256 amount);

  /// @notice Emitted when a member withdraws from a Breadfund
  event BreadfundWithdrawn(uint256 indexed id, address indexed member, uint256 amount);

  /// @notice Emitted when a token is allowed or disallowed for Breadfund use
  event TokenAllowed(address indexed token, bool indexed allowed);

  /// @notice Emitted when a new member joins a Breadfund
  event NewBreadfundMember(uint256 indexed id, address indexed member, uint256 amount);

  /// @notice Emitted when a new request is created
  event RequestCreated(uint256 indexed id, address owner, uint256 timestamp);

  /// @notice Emitted when voting on a request is completed
  event RequestEnded(uint256 indexed id, uint256 yesVotes, uint256 noVotes);

  /// @notice Emitted when a vote is cast on a request
  event Voted(uint256 indexed requestId, address indexed voter, bool vote);

  /*///////////////////////////////////////////////////////////////
                            ERRORS
  //////////////////////////////////////////////////////////////*/

  /// @notice Thrown when a deposit has already been made for the period
  error AlreadyDeposited();

  /// @notice Thrown when trying to create a duplicate Breadfund
  error AlreadyExists();

  /// @notice Thrown on invalid deposit attempt
  error InvalidDeposit();

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

  /// @notice Thrown on ERC20 transfer failure
  error TransferFailed();

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

  /// @notice Thrown for invalid deposit interval
  error InvalidDepositInterval();

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

  /// @notice Thrown when no further withdrawals are allowed
  error MaxWithdrawsReached();

  /// @notice Thrown for invalid request
  error InvalidRequest();

  /// @notice Thrown if a voter has already voted
  error AlreadyVoted();

  /// @notice Thrown if not all required votes have been cast
  error NotAllVoted();

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

  /// @notice Registers a user to a Breadfund with an initial contribution
  /// @param id The Breadfund ID
  /// @param contribute The initial amount to contribute
  function register(uint256 id, uint256 contribute) external;

  /// @notice Makes a deposit into a Breadfund
  /// @param id The Breadfund ID
  /// @param value Amount to deposit
  function deposit(uint256 id, uint256 value) external;

  /// @notice Creates a new request for withdraw from a Breadfund
  /// @param request The withdraw request details
  /// @return id The request ID
  function createRequest(Request memory request) external returns (uint256);

  /// @notice Ends the voting on a request and records results
  /// @param requestId The ID of the request
  function endRequest(uint256 requestId) external;

  /// @notice Casts a vote on a request
  /// @param requestId The ID of the request
  /// @param voteValue True for yes, false for no
  function vote(uint256 requestId, bool voteValue) external;

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
