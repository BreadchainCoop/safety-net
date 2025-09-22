// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Safety Net Collective Savings Contract Interface
/// @notice This interface defines the structure and interaction logic for SafetyNet, a group savings and voting system.
/// @dev All function inputs/outputs are documented via NatSpec for external visibility.
/// @author @exo404
/// @author @valeriooconte
/// @author @RonTuretzky
interface ISafetyNet {
  /*///////////////////////////////////////////////////////////////
                            STRUCTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Struct defining a Safety Net group
  /// @param id Unique identifier for the SafetyNet
  /// @param owner The creator of the SafetyNet
  /// @param minimumMembers Minimum number of members required to create a SafetyNet
  /// @param maximumMembers Maximum number of members allowed in the SafetyNet
  /// @param consensusThreshold Percentage of members required to approve a request
  /// @param safetyNetStart Timestamp when the SafetyNet becomes active
  /// @param token The ERC20 token used for deposits and withdrawals
  /// @param members List of member addresses
  /// @param initialDeposit Initial deposit required to join
  /// @param fixedDeposit Fixed deposit fee amount
  /// @param contestWindow Duration of the contest period for requests
  /// @param votingWindow Duration of the voting period for requests
  /// @param currentEpoch Current epoch index
  /// @param epochDuration Duration of each epoch in seconds
  /// @param smallWithdrawsLimit Maximum amount allowed for small withdrawals
  struct SafetyNet {
    uint256 id;
    address owner;
    uint256 minimumMembers;
    uint256 maximumMembers;
    uint256 consensusThreshold;
    uint256 safetyNetStart;
    address token;
    address[] members;
    uint256 initialDeposit;
    uint256 fixedDeposit;
    uint256 ratio;
    uint256 autoThreshold;
    uint256 contestWindow;
    uint256 votingWindow;
    uint256 currentEpoch;
    uint256 epochDuration;
    uint256 smallWithdrawsLimit;
  }

  /// @notice Struct defining a withdraw request within a SafetyNet
  /// @param owner The request initiator
  /// @param safetyNetId ID of the related SafetyNet
  /// @param timestamp Creation time of the request
  /// @param yesVotes Number of yes votes received
  /// @param noVotes Number of no votes received
  /// @param amount Amount requested for withdrawal
  struct Request {
    address owner;
    uint256 safetyNetId;
    uint256 timestamp;
    uint256 yesVotes;
    uint256 noVotes;
    uint256 amount;
  }

  /*///////////////////////////////////////////////////////////////
                            EVENTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Emitted when a new SafetyNet is created
  event SafetyNetCreated(
    uint256 indexed id,
    uint256 minimumMembers,
    uint256 maximumMembers,
    uint256 consensusThreshold,
    address[] members,
    address token,
    uint256 initialDeposit,
    uint256 fixedDeposit,
    uint256 ratio,
    uint256 autoThreshold,
    uint256 epochDuration,
    uint256 smallWithdrawsLimit
  );

  /// @notice Emitted when a SafetyNet is decommissioned
  event SafetyNetDecommissioned(uint256 indexed id);

  /// @notice Emitted when a member deposits to a SafetyNet
  event FundsDeposited(uint256 indexed id, address indexed member, uint256 amount);

  /// @notice Emitted when a member withdraws from a SafetyNet
  event FundsWithdrawn(uint256 indexed id, address indexed member, uint256 amount);

  /// @notice Emitted when a token is allowed or disallowed for SafetyNet use
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

  /*///////////////////////////////////////////////////////////////
                            ERRORS
  //////////////////////////////////////////////////////////////*/

  /// @notice Thrown when the minimum members is less than 2
  error InvalidMinimumMembers();

  /// @notice Thrown when the maximum members is less than the minimum members
  error InvalidMaximumMembers();

  /// @notice Thrown when a deposit has already been made for the period
  error AlreadyDeposited();

  /// @notice Thrown when trying to create a duplicate SafetyNet
  error AlreadyExists();

  /// @notice Thrown when the SafetyNet ID is not found
  error InvalidSafetyNet();

  /// @notice Thrown if the fund is not in an active state
  error NotCommissioned();

  /// @notice Thrown if the user is not a SafetyNet member
  error NotMember();

  /// @notice Thrown if the SafetyNet cannot be decommissioned yet
  error NotDecommissionable();

  /// @notice Thrown if the SafetyNet cannot be withdrawn from
  error NotWithdrawable();

  /// @notice Thrown when the deposit window is closed
  error DepositWindowClosed();

  /// @notice Thrown when the SafetyNet has expired
  error SafetyNetExpired();

  /// @notice Thrown when the deposit exceeds allowed limits
  error ExceedsDepositAmount();

  /// @notice Thrown if attempting to deposit before the fund starts
  error DepositBeforeSafetyNetStart();

  /// @notice Thrown if the specified token is not whitelisted
  error TokenNotAllowed();

  /// @notice Thrown for deposit amounts that do not match requirements
  error InvalidDepositAmount();

  /// @notice Thrown for an invalid SafetyNet start time
  error InvalidSafetyNetStartTime();

  /// @notice Thrown when indexing fails
  error InvalidCurrentIndex();

  /// @notice Thrown when caller is not the owner
  error InvalidOwner();

  /// @notice Thrown if a member address is invalid
  error InvalidMemberAddress();

  /// @notice Thrown if the member list has duplicates
  error DuplicateMember();

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

  /// @notice Thrown when epoch duration is invalid
  error InvalidEpochDuration();

  /// @notice Thrown when small withdraws limit is invalid
  error InvalidSmallWithdrawsLimit();

  /// @notice Thrown when the request amount exceeds the small withdraws limit
  /// @notice Thrown when small withdrawal limit is invalid
  error InvalidSmallWithdrawalLimit();

  /// @notice Thrown when the request amount exceeds the small withdrawal limit
  error ExceedsSmallWithdrawalLimit();

  /*///////////////////////////////////////////////////////////////
                            EXTERNAL
  //////////////////////////////////////////////////////////////*/

  /// @notice Initializes the SafetyNet interface for an owner
  /// @param owner The address that will control the SafetyNet
  function initialize(address owner) external;

  /// @notice Toggles whether a token is allowed for use in SafetyNets
  /// @param token The ERC20 token address
  /// @param allowed Whether the token is allowed or not
  function setTokenAllowed(address token, bool allowed) external;

  /// @notice Creates a new SafetyNet
  /// @param safetyNet The SafetyNet configuration
  /// @return id The unique ID of the newly created SafetyNet
  function create(SafetyNet memory safetyNet) external returns (uint256);

  /// @notice Decommissions an existing SafetyNet
  /// @param id ID of the SafetyNet to decommission
  function decommission(uint256 id) external;

  /// @notice Makes a deposit into a SafetyNet
  /// @param id The SafetyNet ID
  /// @param value Amount to deposit
  function deposit(uint256 id, uint256 value) external;

  /// @notice Makes a deposit into a SafetyNet for another member
  /// @param id The SafetyNet ID
  /// @param value Amount to deposit
  /// @param member The member address making the deposit
  function depositFor(uint256 id, uint256 value, address member) external;

  /// @notice Makes a withdrawal from a SafetyNet
  /// @param id The SafetyNet ID
  /// @param daysRequested Number of days for calculating withdrawal amount
  function withdraw(uint256 id, uint256 daysRequested) external;

  /// @notice Creates a new request for withdraw from a SafetyNet
  /// @param request The withdraw request details
  /// @return id The request ID
  function createRequest(Request memory request) external returns (uint256);

  /// @notice Contests a request
  /// @param requestId The ID of the request to contest
  function contest(uint256 requestId) external;

  /// @notice Checks if a request can be contested
  /// @param requestId The ID of the request to check
  function executeContestedWithdrawal(uint256 requestId) external;

  /// @notice Casts a vote on a request
  /// @param requestId The ID of the request
  /// @param voteValue True for yes, false for no
  function vote(uint256 requestId, bool voteValue) external;

  /*///////////////////////////////////////////////////////////////
                            VIEW
  //////////////////////////////////////////////////////////////*/

  /// @notice Retrieves a single SafetyNet by ID
  /// @param id The SafetyNet ID
  /// @return safetyNet The SafetyNet struct
  function getSafetyNet(uint256 id) external view returns (SafetyNet memory);

  /// @notice Retrieves multiple SafetyNets by IDs
  /// @param ids Array of SafetyNet IDs
  /// @return safetyNets Array of SafetyNet structs
  function getSafetyNets(uint256[] calldata ids) external view returns (SafetyNet[] memory);

  /// @notice Returns all SafetyNets a member is part of
  /// @param member Address of the member
  /// @return ids List of SafetyNet IDs the member has joined
  function getMemberSafetyNets(address member) external view returns (uint256[] memory);

  /// @notice Gets the balances of each member in a SafetyNet
  /// @param id SafetyNet ID
  /// @return members Array of member addresses
  /// @return balances Array of corresponding balances
  function getMemberBalances(uint256 id) external view returns (address[] memory members, uint256[] memory balances);

  /// @notice Checks if a token is allowed
  /// @param token ERC20 token address
  /// @return allowed True if the token is allowed, false otherwise
  function isTokenAllowed(address token) external view returns (bool);

  /// @notice Gets the current epoch index for a SafetyNet (calculated from time)
  /// @param safetyNetId The SafetyNet ID
  /// @return epochIndex The current epoch index based on time elapsed
  function getCurrentEpochIndex(uint256 safetyNetId) external view returns (uint256);

  /// @notice Checks if a SafetyNet is eligible for decommission
  /// @param safetyNetId The SafetyNet ID
  /// @return decommissionable True if the safetyNet can be decommissioned (when someone missed a payment)
  function isDecommissionable(uint256 safetyNetId) external view returns (bool);

  /// @notice Checks if a member has deposited in a specific epoch
  /// @param safetyNetId The SafetyNet ID
  /// @param member The member address
  /// @param epochIndex The epoch index to check
  /// @return hasDeposited True if the member deposited in that epoch
  function hasMemberDepositedInEpoch(
    uint256 safetyNetId,
    address member,
    uint256 epochIndex
  ) external view returns (bool);
}
