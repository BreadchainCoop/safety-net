// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Safety Net Collective Savings Contract Interface
/// @notice This interface defines the structure and interaction logic for Safety Net, a group savings and contesting system.
/// @dev All function inputs/outputs are documented via NatSpec for external visibility.
/// @author @exo404
/// @author @valeriooconte
/// @author @RonTuretzky
/// @author @Fiuum1
interface ISafetyNet {
  /*///////////////////////////////////////////////////////////////
                            STRUCTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Struct defining a Safety Net group
  /// @param id Unique identifier for the Safety Net
  /// @param owner The creator of the Safety Net
  /// @param minimumMembers Minimum number of members required to create a Safety Net
  /// @param maximumMembers Maximum number of members allowed in the Safety Net
  /// @param contestThreshold Percentage threshold of members; a withdrawal request is vetoed/cancelled only if the share of contesting members exceeds this percentage
  /// @param safetyNetStart Timestamp when the Safety Net becomes active
  /// @param token The ERC20 token used for deposits and withdrawals
  /// @param members List of member addresses
  /// @param initialDeposit Initial deposit required to join
  /// @param fixedDeposit Fixed deposit fee amount
  /// @param redeemRatio Ratio of deposit to withdrawal; must be exactly 1 in v1 (leverage is disabled), field retained for forward-compatibility
  /// @param contestWindow Duration of the contest period for requests
  /// @param epochDuration Duration of each epoch in seconds
  /// @param smallWithdrawsLimit Maximum amount allowed for small withdrawals
  struct SafetyNet {
    uint256 id;
    address owner;
    uint256 minimumMembers;
    uint256 maximumMembers;
    uint256 contestThreshold;
    uint256 safetyNetStart;
    address token;
    address[] members;
    uint256 initialDeposit;
    uint256 fixedDeposit;
    uint256 redeemRatio;
    uint256 autoThreshold;
    uint256 contestWindow;
    uint256 epochDuration;
    uint256 smallWithdrawsLimit;
  }

  /// @notice Struct defining a withdraw request within a Safety Net
  /// @param owner The request initiator
  /// @param safetyNetId ID of the related Safety Net
  /// @param timestamp Creation time of the request
  /// @param contestCount Number of members who contested
  /// @param amount Amount requested for withdrawal
  struct Request {
    address owner;
    uint256 safetyNetId;
    uint256 timestamp;
    uint256 contestCount;
    uint256 amount;
  }

  /// @notice Struct defining an invite to join a Safety Net
  /// @param safetyNetId ID of the Safety Net
  /// @param nonce Unique nonce for the invite
  struct Invite {
    uint256 safetyNetId;
    uint256 nonce;
  }

  /// @notice Struct pairing a request with its derived status, for frontend consumption
  /// @param id Unique identifier of the request
  /// @param request The stored request data
  /// @param isVetoed Whether the request has been vetoed
  /// @param isExecuted Whether the request has been executed
  /// @param isContestable Whether the request can be contested now (exists, contest window open, not vetoed)
  /// @param isExecutable Whether the request can be executed now (window closed, not vetoed, not executed, net commissioned, owner balance sufficient)
  struct RequestView {
    uint256 id;
    Request request;
    bool isVetoed;
    bool isExecuted;
    bool isContestable;
    bool isExecutable;
  }

  /// @notice Aggregated Safety Net details for a given member, for frontend consumption
  /// @param safetyNet The Safety Net struct
  /// @param totalBalance Total balance held by the Safety Net
  /// @param memberCount Number of members in the Safety Net
  /// @param isMember Whether the queried address is a member
  /// @param withdrawableBalance The queried member's withdrawable balance
  /// @param monthlyContribute The queried member's monthly contribution amount
  /// @param duesRemaining Amount the queried member still owes this epoch
  /// @param currentEpochIndex The current epoch index of the Safety Net
  /// @param isDecommissionable Whether the Safety Net can be decommissioned
  /// @param requests The Safety Net's requests with derived status
  struct SafetyNetDetails {
    SafetyNet safetyNet;
    uint256 totalBalance;
    uint256 memberCount;
    bool isMember;
    uint256 withdrawableBalance;
    uint256 monthlyContribute;
    uint256 duesRemaining;
    uint256 currentEpochIndex;
    bool isDecommissionable;
    RequestView[] requests;
  }

  /*///////////////////////////////////////////////////////////////
                            EVENTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Emitted when a new Safety Net is created
  /// @param id Unique identifier of the Safety Net
  /// @param minimumMembers Minimum number of members required
  /// @param maximumMembers Maximum number of members allowed
  /// @param contestThreshold Percentage threshold of members required to veto a request
  /// @param members List of member addresses
  /// @param token The ERC20 token used for deposits and withdrawals
  /// @param initialDeposit Initial deposit required to join
  /// @param fixedDeposit Fixed deposit fee amount
  /// @param redeemRatio Ratio of deposit to withdrawal
  /// @param autoThreshold Maximum amount auto-executed without a request
  /// @param epochDuration Duration of each epoch in seconds
  /// @param smallWithdrawsLimit Maximum number of small withdrawals per epoch
  event SafetyNetCreated(
    uint256 indexed id,
    uint256 minimumMembers,
    uint256 maximumMembers,
    uint256 contestThreshold,
    address[] members,
    address token,
    uint256 initialDeposit,
    uint256 fixedDeposit,
    uint256 redeemRatio,
    uint256 autoThreshold,
    uint256 epochDuration,
    uint256 smallWithdrawsLimit
  );

  /// @notice Emitted when a Safety Net is decommissioned
  /// @param id Unique identifier of the Safety Net
  event SafetyNetDecommissioned(uint256 indexed id);

  /// @notice Emitted when a member deposits to a Safety Net
  /// @param id Unique identifier of the Safety Net
  /// @param member The depositing member
  /// @param amount Amount deposited
  event FundsDeposited(uint256 indexed id, address indexed member, uint256 amount);

  /// @notice Emitted when a member withdraws from a Safety Net
  /// @param id Unique identifier of the Safety Net
  /// @param member The withdrawing member
  /// @param amount Amount withdrawn
  event FundsWithdrawn(uint256 indexed id, address indexed member, uint256 amount);

  /// @notice Emitted when a token is allowed or disallowed for Safety Net use
  /// @param token The ERC20 token address
  /// @param allowed Whether the token is allowed or not
  event TokenAllowed(address indexed token, bool indexed allowed);

  /// @notice Emitted when a new request is created
  /// @param id Unique identifier of the request
  /// @param owner The request initiator
  /// @param timestamp Creation time of the request
  /// @param amount Amount requested for withdrawal
  event RequestCreated(uint256 indexed id, address owner, uint256 timestamp, uint256 amount);

  /// @notice Emitted when a withdraw request is pending
  /// @param requestId Unique identifier of the request
  /// @param owner The request initiator
  /// @param amount Amount requested for withdrawal
  event WithdrawalPending(uint256 indexed requestId, address indexed owner, uint256 amount);

  /// @notice Emitted when a request is contested
  /// @param requestId Unique identifier of the request
  /// @param owner The request initiator
  /// @param timestamp Time at which the request was contested
  event WithdrawalContested(uint256 indexed requestId, address indexed owner, uint256 timestamp);

  /// @notice Emitted when a request is auto-executed after contest period
  /// @param requestId Unique identifier of the request
  /// @param owner The request initiator
  /// @param amount Amount withdrawn
  event WithdrawalAutoExecuted(uint256 indexed requestId, address indexed owner, uint256 amount);

  /// @notice Emitted when a request reaches the veto threshold and is cancelled
  /// @param requestId Unique identifier of the request
  /// @param owner The request initiator
  /// @param timestamp Time at which the request was vetoed
  event WithdrawalVetoed(uint256 indexed requestId, address indexed owner, uint256 timestamp);

  /// @notice Emitted when an invite is successfully redeemed
  /// @param safetyNetId Unique identifier of the Safety Net
  /// @param redeemer The address that redeemed the invite and joined
  event InviteRedeemed(uint256 indexed safetyNetId, address indexed redeemer);

  /// @notice Emitted when a request authorization nonce is cancelled by its owner
  /// @param safetyNetId Unique identifier of the Safety Net
  /// @param owner The owner of the nonce space that cancelled the nonce
  /// @param nonce The cancelled nonce
  event RequestNonceCancelled(uint256 indexed safetyNetId, address indexed owner, uint256 nonce);

  /*///////////////////////////////////////////////////////////////
                            ERRORS
  //////////////////////////////////////////////////////////////*/

  /// @notice Thrown when the minimum members is less than 2
  error InvalidMinimumMembers();

  /// @notice Thrown when the maximum members is less than the minimum members
  error InvalidMaximumMembers();

  /// @notice Thrown when a deposit has already been made for the period
  error AlreadyDeposited();

  /// @notice Thrown when trying to create a duplicate Safety Net
  error AlreadyExists();

  /// @notice Thrown when a member is trying to contest a request that they have already contested
  error AlreadyContestedByMember();

  /// @notice Thrown when the Safety Net ID is not found
  error InvalidSafetyNet();

  /// @notice Thrown if the fund is not in an active state
  error NotCommissioned();

  /// @notice Thrown if the user is not a Safety Net member
  error NotMember();

  /// @notice Thrown if the Safety Net cannot be decommissioned yet
  error NotDecommissionable();

  /// @notice Thrown if the Safety Net cannot be withdrawn from
  error NotWithdrawable();

  /// @notice Thrown when the deposit window is closed
  error DepositWindowClosed();

  /// @notice Thrown when the Safety Net has expired
  error SafetyNetExpired();

  /// @notice Thrown when the deposit exceeds allowed limits
  error ExceedsDepositAmount();

  /// @notice Thrown if attempting to deposit before the fund starts
  error DepositBeforeSafetyNetStart();

  /// @notice Thrown if the specified token is not whitelisted
  error TokenNotAllowed();

  /// @notice Thrown for deposit amounts that do not match requirements
  error InvalidDepositAmount();

  /// @notice Thrown for an invalid Safety Net start time
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

  /// @notice Thrown for invalid amount zero
  error InvalidAmountZero();

  /// @notice Thrown for invalid address zero
  error InvalidAddressZero();

  /// @notice Thrown if the request is already vetoed
  error AlreadyVetoed();

  /// @notice Thrown if the request has already been executed
  error AlreadyExecuted();

  /// @notice Thrown if the request is not contestable
  error ContestWindowClosed();

  /// @notice Thrown when epoch duration is invalid
  error InvalidEpochDuration();

  /// @notice Thrown when redeemRatio is out of valid range
  error InvalidRatio();

  /// @notice Thrown when small withdraws limit is invalid
  error InvalidSmallWithdrawsLimit();

  /// @notice Thrown when the request amount exceeds the small withdraws limit
  /// @notice Thrown when small withdrawal limit is invalid
  error InvalidSmallWithdrawalLimit();

  /// @notice Thrown when the request amount exceeds the small withdrawal limit
  error ExceedsSmallWithdrawalLimit();

  /// @notice Thrown when attempting to redeem an invite that was already used
  error InviteAlreadyUsed();

  /// @notice Thrown when the signer of an invite is invalid
  error InvalidSigner();

  /// @notice Thrown when the caller is already a member of the Safety Net
  error AlreadyMember();

  /// @notice Thrown when attempting to add members beyond the maximum allowed
  error SafetyNetFull();

  /// @notice Thrown when attempting to reuse a request authorization nonce
  error RequestNonceAlreadyUsed();

  /// @notice Thrown when a request authorization is submitted after its deadline
  error AuthorizationExpired();

  /*///////////////////////////////////////////////////////////////
                            EXTERNAL
  //////////////////////////////////////////////////////////////*/

  /// @notice Initializes the Safety Net interface for an owner
  /// @param owner The address that will control the Safety Net
  function initialize(address owner) external;

  /// @notice Toggles whether a token is allowed for use in Safety Nets
  /// @param token The ERC20 token address
  /// @param allowed Whether the token is allowed or not
  function setTokenAllowed(address token, bool allowed) external;

  /// @notice Creates a new Safety Net
  /// @param safetyNet The Safety Net configuration
  /// @return id The unique ID of the newly created Safety Net
  function create(SafetyNet memory safetyNet) external returns (uint256);

  /// @notice Decommissions an existing Safety Net
  /// @param id ID of the Safety Net to decommission
  function decommission(uint256 id) external;

  /// @notice Makes a deposit into a Safety Net
  /// @dev The first deposit (onboarding) must equal `initialDeposit` exactly. Afterwards, partial
  ///      payments toward the current epoch's `fixedDeposit` dues are allowed, and any excess is
  ///      carried forward as prepayment of future epochs, up to `MAX_PREPAY_EPOCHS` (12) epochs
  ///      beyond the current one; reverts if the value cannot be fully allocated within that window
  /// @param id The Safety Net ID
  /// @param value Amount to deposit
  function deposit(uint256 id, uint256 value) external;

  /// @notice Makes a deposit into a Safety Net for another member
  /// @dev Same allocation rules as {deposit}: exact `initialDeposit` for onboarding, then partial
  ///      payments plus prepayment of up to `MAX_PREPAY_EPOCHS` (12) future epochs
  /// @param id The Safety Net ID
  /// @param value Amount to deposit
  /// @param member The member address making the deposit
  function depositFor(uint256 id, uint256 value, address member) external;

  /// @notice Redeems an invite signed by the Safety Net owner
  /// @param invite The invite data containing the Safety Net ID and nonce
  /// @param signature The owner's EIP-712 signature
  function redeemInvite(Invite calldata invite, bytes calldata signature) external;

  /// @notice Makes a withdrawal from a Safety Net
  /// @param id The Safety Net ID
  /// @param daysRequested Number of days for calculating withdrawal amount
  function withdraw(uint256 id, uint256 daysRequested) external;

  /// @notice Creates a new request for withdraw from a Safety Net
  /// @param request The withdraw request details
  /// @return id The request ID
  function createRequest(Request memory request) external returns (uint256);

  /// @notice Creates a new withdraw request on behalf of the request owner using an EIP-712 signature
  /// @dev The request owner signs `RequestAuthorization(uint256 safetyNetId,uint256 amount,uint256 nonce,uint256 deadline)`; anyone may submit
  /// @param request The withdraw request details; `owner` must be the signer and a member of the Safety Net
  /// @param nonce Unique nonce chosen by the owner, tracked per (safetyNetId, owner) to prevent replay
  /// @param deadline Timestamp after which the authorization is no longer valid
  /// @param signature The owner's EIP-712 signature over the request authorization
  /// @return id The request ID
  function createRequestWithSignature(
    Request memory request,
    uint256 nonce,
    uint256 deadline,
    bytes calldata signature
  ) external returns (uint256);

  /// @notice Cancels an unused request authorization nonce in the caller's own nonce space
  /// @param safetyNetId The Safety Net ID the nonce is scoped to
  /// @param nonce The nonce to cancel
  function cancelRequestNonce(uint256 safetyNetId, uint256 nonce) external;

  /// @notice Contests a request
  /// @param requestId The ID of the request to contest
  function contest(uint256 requestId) external;

  /// @notice Checks if a request can be contested
  /// @param requestId The ID of the request to check
  function executeContestedWithdrawal(uint256 requestId) external;

  /*///////////////////////////////////////////////////////////////
                            VIEW
  //////////////////////////////////////////////////////////////*/

  /// @notice Retrieves a single Safety Net by ID
  /// @param id The Safety Net ID
  /// @return safetyNet The Safety Net struct
  function getSafetyNet(uint256 id) external view returns (SafetyNet memory);

  /// @notice Retrieves multiple Safety Nets by IDs
  /// @param ids Array of Safety Net IDs
  /// @return safetyNets Array of Safety Net structs
  function getSafetyNets(uint256[] calldata ids) external view returns (SafetyNet[] memory);

  /// @notice Returns all Safety Nets a member is part of
  /// @param member Address of the member
  /// @return ids List of Safety Net IDs the member has joined
  function getMemberSafetyNets(address member) external view returns (uint256[] memory);

  /// @notice Gets the balances of each member in a Safety Net
  /// @param id Safety Net ID
  /// @return members Array of member addresses
  /// @return balances Array of corresponding balances
  function getMemberBalances(uint256 id) external view returns (address[] memory members, uint256[] memory balances);

  /// @notice Returns the list of members in a Safety Net who still owe dues in the current epoch.
  /// @param _id Safety Net ID.
  /// @return _membersNeedingDeposit Array of member addresses that need to deposit for the current epoch.
  function getMembersNeedingDeposit(uint256 _id) external view returns (address[] memory _membersNeedingDeposit);

  /// @notice Checks if a token is allowed
  /// @param token ERC20 token address
  /// @return allowed True if the token is allowed, false otherwise
  function isTokenAllowed(address token) external view returns (bool);

  /// @notice Gets the current epoch index for a Safety Net (calculated from time)
  /// @param safetyNetId The Safety Net ID
  /// @return epochIndex The current epoch index based on time elapsed
  function getCurrentEpochIndex(uint256 safetyNetId) external view returns (uint256);

  /// @notice Returns how much a member still needs to pay this epoch to reach their fixedDeposit dues
  /// @param id Safety Net ID
  /// @param member Member address
  /// @return remaining Amount left to reach the fixed deposit in the current epoch
  function duesRemainingThisEpoch(uint256 id, address member) external view returns (uint256 remaining);

  /// @notice Checks if a Safety Net is eligible for decommission
  /// @param safetyNetId The Safety Net ID
  /// @return decommissionable True if the safetyNet can be decommissioned (when someone missed a payment)
  function isDecommissionable(uint256 safetyNetId) external view returns (bool);

  /// @notice Checks if a member has deposited in a specific epoch
  /// @param safetyNetId The Safety Net ID
  /// @param member The member address
  /// @param epochIndex The epoch index to check
  /// @return hasDeposited True if the member deposited in that epoch
  function hasMemberDepositedInEpoch(uint256 safetyNetId, address member, uint256 epochIndex) external view returns (bool);

  /// @notice Returns the member addresses of a Safety Net
  /// @param id The Safety Net ID
  /// @return members Array of member addresses
  function getMembers(uint256 id) external view returns (address[] memory members);

  /// @notice Returns the IDs of all requests created for a Safety Net
  /// @param id The Safety Net ID
  /// @return requestIds Array of request IDs
  function getSafetyNetRequestIds(uint256 id) external view returns (uint256[] memory requestIds);

  /// @notice Returns all requests of a Safety Net with their derived status
  /// @param id The Safety Net ID
  /// @return requestViews Array of requests with derived status
  function getSafetyNetRequests(uint256 id) external view returns (RequestView[] memory requestViews);

  /// @notice Returns aggregated details of a Safety Net for a given member
  /// @param id The Safety Net ID
  /// @param member The member address to compute member-specific fields for
  /// @return details The aggregated Safety Net details
  function getSafetyNetDetails(uint256 id, address member) external view returns (SafetyNetDetails memory details);

  /// @notice Returns aggregated details for every Safety Net a member has joined
  /// @param member The member address
  /// @return dashboard Array of aggregated details for each of the member's Safety Nets
  function getMemberDashboard(address member) external view returns (SafetyNetDetails[] memory dashboard);
}
