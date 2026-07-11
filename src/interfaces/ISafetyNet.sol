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
  /// @param owner The creator of the Safety Net; registered as the sole founding member at creation
  /// @param minimumMembers Minimum number of members required to start a Safety Net; enforced by start()
  /// @param maximumMembers Maximum number of members allowed in the Safety Net; the seat target the UI sizes invites against. Enforced at invite redemption, though the finite number of owner-signed invites is the effective cap in the normal flow
  /// @param contestThreshold Percentage threshold of members; a withdrawal request is vetoed/cancelled only if the share of contesting members exceeds this percentage
  /// @param safetyNetStart Activation timestamp stamped by start(); 0 means the Safety Net has not started yet. Must be 0 at creation
  /// @param token The ERC20 token used for deposits and withdrawals
  /// @param members List of joined member addresses; must be empty at creation (the owner is pushed as the sole member) and grows via redeemInvite()
  /// @param initialDeposit Initial deposit required to join
  /// @param fixedDeposit Fixed deposit fee amount
  /// @param redeemRatio Configured support ratio: a member in need may draw up to `redeemRatio` x their
  ///        monthly contribution per month (Broodfonds convention is ~22x). Must be within
  ///        [MINIMUM_REDEEM_RATIO, MAXIMUM_REDEEM_RATIO]. Values > 1 are solidarity leverage — claims are
  ///        backed by the shared pool, not individual deposits — and are throttled at withdrawal time by
  ///        the actuarial effective-ratio cap (see getEffectiveRedeemRatio)
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
  /// @param reason The requester-supplied reason attached to the request; empty string when none was provided
  struct RequestView {
    uint256 id;
    Request request;
    bool isVetoed;
    bool isExecuted;
    bool isContestable;
    bool isExecutable;
    string reason;
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
  /// @param effectiveRedeemRatio The queried member's current effective support ratio (see getEffectiveRedeemRatio)
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
    uint256 effectiveRedeemRatio;
    RequestView[] requests;
  }

  /*///////////////////////////////////////////////////////////////
                            EVENTS
  //////////////////////////////////////////////////////////////*/

  /// @notice Emitted when a new Safety Net is created
  /// @param id Unique identifier of the Safety Net
  /// @param owner The creator of the Safety Net and its sole founding member
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
  /// @param name Optional human-readable name for the Safety Net; empty string when none was provided
  event SafetyNetCreated(
    uint256 indexed id,
    address indexed owner,
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
    uint256 smallWithdrawsLimit,
    string name
  );

  /// @notice Emitted when a Safety Net is started by its owner
  /// @param id Unique identifier of the Safety Net
  /// @param startTime Timestamp at which the Safety Net became active
  event SafetyNetStarted(uint256 indexed id, uint256 startTime);

  /// @notice Emitted when a Safety Net is decommissioned
  /// @param id Unique identifier of the Safety Net
  event SafetyNetDecommissioned(uint256 indexed id);

  /// @notice Emitted when a decommission distributes a shortfall pool pro-rata
  /// @dev Only possible when `redeemRatio` > 1: total withdrawable claims exceeded the pool,
  ///      so each member received `pool x claim / totalClaims` instead of their full balance
  /// @param id Unique identifier of the Safety Net
  /// @param poolBalance The pool balance that was distributed
  /// @param totalWithdrawable The total withdrawable claims the pool could not fully cover
  event SafetyNetShortfallDistributed(uint256 indexed id, uint256 poolBalance, uint256 totalWithdrawable);

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
  /// @param safetyNetId Unique identifier of the Safety Net the request belongs to
  /// @param owner The request initiator
  /// @param timestamp Creation time of the request
  /// @param amount Amount requested for withdrawal
  /// @param reason The requester-supplied reason for the withdrawal; empty string when none was provided
  event RequestCreated(uint256 indexed id, uint256 indexed safetyNetId, address owner, uint256 timestamp, uint256 amount, string reason);

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

  /// @notice Thrown when the Safety Net pool balance cannot cover a payout
  /// @dev Possible when `redeemRatio` > 1: withdrawable balances are leveraged solidarity claims
  ///      (deposits x ratio), not fully-backed deposits, so the pool can run short. The member can
  ///      retry once dues replenish the pool, or the net can be decommissioned for a pro-rata split.
  error InsufficientPoolFunds();

  /// @notice Thrown when the deposit window is closed
  error DepositWindowClosed();

  /// @notice Thrown when the Safety Net has expired
  error SafetyNetExpired();

  /// @notice Thrown when the deposit exceeds allowed limits
  error ExceedsDepositAmount();

  /// @notice Thrown if attempting to deposit into a Safety Net that has not been started via start()
  error DepositBeforeSafetyNetStart();

  /// @notice Thrown if the specified token is not whitelisted
  error TokenNotAllowed();

  /// @notice Thrown for deposit amounts that do not match requirements
  error InvalidDepositAmount();

  /// @notice Thrown when a nonzero start time is passed at creation; the start time is stamped by start()
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

  /// @notice Thrown when a nonempty members array is passed at creation; the owner is the sole founding member and everyone else joins via invites
  error InvalidMembers();

  /// @notice Thrown when starting an already-started Safety Net or redeeming an invite after start
  error AlreadyActive();

  /// @notice Thrown when starting a Safety Net with fewer joined members than `minimumMembers`
  error NotEnoughMembers();

  /// @notice Thrown when withdrawing or creating a withdraw request on a Safety Net that has not been started via start()
  error NotActive();

  /// @notice Thrown when a withdrawal request reason exceeds `MAX_REASON_BYTES` bytes
  error ReasonTooLong();

  /// @notice Thrown when a Safety Net name exceeds `MAX_NAME_BYTES` bytes
  error NameTooLong();

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

  /// @notice Creates a new Safety Net with the configured owner as its sole founding member
  /// @dev `members` must be empty and `safetyNetStart` must be 0; further members join via
  ///      {redeemInvite} and the start time is stamped by {start}. `owner` is taken from the
  ///      struct and is not required to equal msg.sender (relayed creation is allowed)
  /// @param name Optional human-readable name for the Safety Net; must be at most `MAX_NAME_BYTES`
  ///      bytes. Empty string is allowed (the UI falls back to "Safety Net #N"). Stored only when
  ///      non-empty and read back via {safetyNetNames}
  /// @param safetyNet The Safety Net configuration
  /// @return id The unique ID of the newly created Safety Net
  function create(string calldata name, SafetyNet memory safetyNet) external returns (uint256);

  /// @notice Starts a Safety Net, stamping its activation timestamp and opening the deposit/withdraw lifecycle
  /// @dev Only the Safety Net owner may call; requires at least `minimumMembers` joined members.
  ///      After start, invites can no longer be redeemed and epochs count from this timestamp
  /// @param id ID of the Safety Net to start
  function start(uint256 id) external;

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

  /// @notice Redeems an invite signed by the Safety Net owner, joining the caller as a member
  /// @dev Only possible between creation and start(); reverts with {AlreadyActive} once started
  /// @param invite The invite data containing the Safety Net ID and nonce
  /// @param signature The owner's EIP-712 signature
  function redeemInvite(Invite calldata invite, bytes calldata signature) external;

  /// @notice Makes a withdrawal from a Safety Net
  /// @dev The reason is validated against `MAX_REASON_BYTES` (the UI enforces roughly 200 words) and
  ///      is stored/emitted only when the amount is large enough to create a withdrawal request;
  ///      on the small/instant path it is ignored
  /// @param id The Safety Net ID
  /// @param daysRequested Number of days for calculating withdrawal amount
  /// @param reason Short human-readable reason for the withdrawal, shown to members deciding whether to contest
  function withdraw(uint256 id, uint256 daysRequested, string calldata reason) external;

  /// @notice Creates a new request for withdraw from a Safety Net
  /// @dev The reason is validated against `MAX_REASON_BYTES` (the UI enforces roughly 200 words)
  /// @param request The withdraw request details
  /// @param reason Short human-readable reason for the withdrawal, shown to members deciding whether to contest
  /// @return id The request ID
  function createRequest(Request memory request, string calldata reason) external returns (uint256);

  /// @notice Creates a new withdraw request on behalf of the request owner using an EIP-712 signature
  /// @dev The request owner signs
  ///      `RequestAuthorization(uint256 safetyNetId,uint256 amount,uint256 nonce,uint256 deadline,string reason)`;
  ///      anyone may submit. The reason is covered by the signature so a relayer cannot attach words to
  ///      someone else's request. Validated against `MAX_REASON_BYTES` (the UI enforces roughly 200 words)
  /// @param request The withdraw request details; `owner` must be the signer and a member of the Safety Net
  /// @param nonce Unique nonce chosen by the owner, tracked per (safetyNetId, owner) to prevent replay
  /// @param deadline Timestamp after which the authorization is no longer valid
  /// @param reason Short human-readable reason for the withdrawal, covered by the owner's signature
  /// @param signature The owner's EIP-712 signature over the request authorization
  /// @return id The request ID
  function createRequestWithSignature(
    Request memory request,
    uint256 nonce,
    uint256 deadline,
    string calldata reason,
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

  /// @notice Returns the optional human-readable name of a Safety Net
  /// @dev This is the read path for names. Returns the empty string when no name was provided at
  ///      creation (the UI then falls back to "Safety Net #N"). The name lives in an appended
  ///      mapping and is not part of the {SafetyNet} struct
  /// @param id The Safety Net ID
  /// @return name The Safety Net's name, or the empty string if none was set
  function safetyNetNames(uint256 id) external view returns (string memory name);

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
  /// @dev Returns an empty array for decommissioned or not-yet-started Safety Nets (no dues before start()).
  /// @param _id Safety Net ID.
  /// @return _membersNeedingDeposit Array of member addresses that need to deposit for the current epoch.
  function getMembersNeedingDeposit(uint256 _id) external view returns (address[] memory _membersNeedingDeposit);

  /// @notice Checks if a token is allowed
  /// @param token ERC20 token address
  /// @return allowed True if the token is allowed, false otherwise
  function isTokenAllowed(address token) external view returns (bool);

  /// @notice Gets the current epoch index for a Safety Net (calculated from time)
  /// @dev Returns 0 while the Safety Net has not been started (safetyNetStart == 0)
  /// @param safetyNetId The Safety Net ID
  /// @return epochIndex The current epoch index based on time elapsed
  function getCurrentEpochIndex(uint256 safetyNetId) external view returns (uint256);

  /// @notice Returns how much a member still needs to pay this epoch to reach their fixedDeposit dues
  /// @dev Returns 0 while the Safety Net has not been started (there are no dues before start())
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

  /// @notice The support ratio actually applied to a member's withdrawals right now
  /// @dev `min(configured redeemRatio, group-size cap, pool-coverage cap)`, floored at 1.
  ///      The group-size cap is an actuarial risk-loading bound `1 / (p + z*sqrt(p(1-p)/N))`
  ///      (expected sick share p, prudence factor z — see the constants in SafetyNet); the
  ///      pool-coverage cap requires the pool to hold POOL_RUNWAY_MONTHS months of the member's
  ///      support rate. Ratio-1 nets (pure savings circles) are never throttled: every claim is
  ///      fully backed by deposits.
  /// @param id The Safety Net ID
  /// @param member The member whose contribution level anchors the pool-coverage cap
  /// @return effectiveRatio The effective support ratio (>= 1)
  function getEffectiveRedeemRatio(uint256 id, address member) external view returns (uint256 effectiveRatio);

  /// @notice Returns aggregated details for every Safety Net a member has joined
  /// @param member The member address
  /// @return dashboard Array of aggregated details for each of the member's Safety Nets
  function getMemberDashboard(address member) external view returns (SafetyNetDetails[] memory dashboard);
}
