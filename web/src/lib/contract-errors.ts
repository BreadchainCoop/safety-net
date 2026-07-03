/**
 * Human-readable copy for every custom error in ISafetyNet. Decoded error
 * names from reverts are looked up here (see parse-contract-error.ts).
 */
export const SAFETY_NET_ERRORS: Record<string, string> = {
  InvalidMinimumMembers: "A Safety Net needs a minimum of at least 2 members.",
  InvalidMaximumMembers:
    "The maximum number of members can't be lower than the minimum.",
  AlreadyDeposited: "You have already paid your dues for this epoch.",
  AlreadyExists: "This Safety Net already exists.",
  AlreadyContestedByMember: "You have already contested this request.",
  InvalidSafetyNet: "This Safety Net could not be found.",
  NotCommissioned: "This Safety Net is not active (or has been wound down).",
  NotMember: "You are not a member of this Safety Net.",
  NotDecommissionable: "This Safety Net can't be wound down yet.",
  NotWithdrawable:
    "The requested amount exceeds your withdrawable balance in this Safety Net.",
  DepositWindowClosed: "The deposit window for this epoch has closed.",
  SafetyNetExpired: "This Safety Net has expired.",
  InvalidMembers:
    "A new Safety Net starts with the owner as its only member — everyone else joins through invite links.",
  AlreadyActive:
    "This Safety Net has already started — joining is closed and it can't be started again.",
  NotEnoughMembers:
    "Not enough members yet — the group must reach its minimum size before the net can start.",
  NotActive:
    "This Safety Net hasn't started yet — the owner needs to start it first.",
  ExceedsDepositAmount:
    "This deposit couldn't be fully allocated — it exceeds your remaining dues plus the 12-epoch prepay window (some future epochs may already be prepaid).",
  DepositBeforeSafetyNetStart:
    "Deposits open once the owner starts the Safety Net — the net hasn't started yet.",
  TokenNotAllowed: "This token is not allowed for Safety Nets.",
  InvalidDepositAmount:
    "Invalid deposit amount. Your first deposit must be exactly the initial deposit, in a single payment.",
  InvalidSafetyNetStartTime: "The start time is invalid.",
  InvalidCurrentIndex: "Internal error: invalid epoch index.",
  InvalidOwner: "Only the owner can do this (or the owner address is invalid).",
  InvalidMemberAddress: "One of the member addresses is invalid.",
  DuplicateMember: "The member list contains a duplicate address.",
  InvalidInitialDeposit: "The initial deposit must be greater than zero.",
  InvalidFixedDeposit: "The recurring deposit must be greater than zero.",
  InvalidMaxWithdraws: "The maximum withdrawals setting is invalid.",
  InvalidThreshold: "The auto-approve threshold must be greater than zero.",
  InvalidAmountZero: "The amount must be greater than zero.",
  InvalidAddressZero: "An address is missing (zero address).",
  AlreadyVetoed: "This request has already been vetoed by the group.",
  AlreadyExecuted: "This request has already been paid out.",
  ContestWindowClosed:
    "The contest window for this request has closed — it can no longer be contested.",
  InvalidEpochDuration: "The epoch duration must be greater than zero.",
  InvalidRatio: "The redeem ratio must be between 1 and 22.",
  InvalidSmallWithdrawsLimit:
    "The small-withdrawals limit must be greater than zero.",
  InvalidSmallWithdrawalLimit: "The small-withdrawal limit is invalid.",
  ExceedsSmallWithdrawalLimit:
    "You've reached the limit of instant (small) withdrawals for this epoch.",
  InviteAlreadyUsed: "This invite link has already been used.",
  InvalidSigner: "This invite wasn't signed by the Safety Net owner.",
  AlreadyMember: "You are already a member of this Safety Net.",
  SafetyNetFull: "This Safety Net has reached its maximum number of members.",
  RequestNonceAlreadyUsed: "This signed request has already been submitted.",
  AuthorizationExpired:
    "This signed request has expired — ask for a new one.",
  // Common OpenZeppelin / ERC20 errors surfaced through the same path
  OwnableUnauthorizedAccount: "Only the contract owner can do this.",
  ERC20InsufficientBalance: "Your token balance is too low for this amount.",
  ERC20InsufficientAllowance:
    "Token allowance too low — approve the Safety Net contract first.",
  SafeERC20FailedOperation: "The token transfer failed.",
  ECDSAInvalidSignature: "This signature is invalid — ask for a new link.",
  ECDSAInvalidSignatureLength:
    "This signature is malformed — the link may have been truncated when shared.",
  ECDSAInvalidSignatureS:
    "This signature is malformed — ask for a new link.",
  OwnableInvalidOwner: "That owner address is invalid.",
  ReentrancyGuardReentrantCall:
    "The contract rejected a re-entrant call. Please try again.",
  InvalidInitialization: "The contract is already initialized.",
  NotInitializing: "The contract is not initializing.",
};
