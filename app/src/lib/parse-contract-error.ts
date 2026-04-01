import { ContractFunctionRevertedError, BaseError } from "viem";

const USER_REJECTION_PATTERNS = [
  "User rejected",
  "user rejected",
  "ACTION_REJECTED",
  "User denied",
  "user denied",
];

const ERROR_MAP: Record<string, string> = {
  AlreadyContested: "This withdrawal has already been contested.",
  AlreadyDeposited: "You have already deposited this epoch.",
  AlreadyExecuted: "This withdrawal has already been executed.",
  AlreadyExists: "This fund already exists.",
  AlreadyMember: "This address is already a member.",
  AlreadyVoted: "You have already voted on this request.",
  ContestWindowClosed: "The contest window has closed.",
  DepositBeforeSafetyNetStart: "The fund has not started yet.",
  DepositWindowClosed: "The deposit window has closed.",
  DuplicateMember: "Duplicate member address.",
  ExceedsDepositAmount: "Amount exceeds the required deposit.",
  ExceedsSmallWithdrawalLimit: "You have used all your auto-approved withdrawals this epoch.",
  InvalidDepositAmount: "Invalid deposit amount.",
  InvalidEpochDuration: "Invalid epoch duration.",
  InvalidFixedDeposit: "Invalid fixed deposit amount.",
  InvalidInitialDeposit: "Invalid initial deposit amount.",
  InvalidMaxWithdraws: "Invalid maximum withdrawals setting.",
  InvalidMaximumMembers: "Invalid maximum members setting.",
  InvalidMemberAddress: "Invalid member address.",
  InvalidMinimumMembers: "Invalid minimum members setting.",
  InvalidOwner: "Invalid owner address.",
  InvalidRatio: "Invalid redeem ratio.",
  InvalidRequest: "Invalid withdrawal request.",
  InvalidSafetyNet: "Invalid fund.",
  InvalidSafetyNetStartTime: "Invalid start time.",
  InvalidSigner: "Invalid invite signature.",
  InvalidSmallWithdrawalLimit: "Invalid small withdrawal limit.",
  InvalidSmallWithdrawsLimit: "Invalid small withdrawals limit.",
  InvalidThreshold: "Invalid consensus threshold.",
  InviteAlreadyUsed: "This invite has already been used.",
  NotAllVoted: "Not all members have voted yet.",
  NotCommissioned: "This fund is not active.",
  NotDecommissionable: "This fund cannot be decommissioned yet.",
  NotMember: "You are not a member of this fund.",
  NotWithdrawable: "No withdrawable balance available.",
  SafetyNetExpired: "This fund has expired.",
  SafetyNetFull: "This fund is full.",
  TokenNotAllowed: "This token is not allowed.",
  TransferFailed: "Token transfer failed.",
  VotingWindowClosed: "The voting window has closed.",
};

export function parseContractError(
  error: unknown,
  fallback: string
): { message: string; isUserRejection: boolean } {
  const errorString = error instanceof Error ? error.message : String(error);

  if (USER_REJECTION_PATTERNS.some((p) => errorString.includes(p))) {
    return { message: "Transaction cancelled.", isUserRejection: true };
  }

  if (error instanceof BaseError) {
    const revertError = error.walk(
      (e) => e instanceof ContractFunctionRevertedError
    );
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName;
      if (errorName && ERROR_MAP[errorName]) {
        return { message: ERROR_MAP[errorName], isUserRejection: false };
      }
    }
  }

  return { message: fallback, isUserRejection: false };
}
