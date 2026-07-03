import type { ContractFunctionReturnType } from "viem";
import { safetyNetAbi } from "@/lib/abi/safety-net";

/**
 * All frontend types are derived from the generated ABI, so refreshing the
 * ABI file (pnpm generate:abi) automatically propagates struct changes.
 */
export type SafetyNetDetails = ContractFunctionReturnType<
  typeof safetyNetAbi,
  "view",
  "getSafetyNetDetails"
>;

export type SafetyNetStruct = SafetyNetDetails["safetyNet"];

export type RequestView = SafetyNetDetails["requests"][number];

/** Derived UI status for a withdrawal request. */
export type RequestStatus =
  "vetoed" | "executed" | "contestable" | "executable";

export function requestStatus(r: RequestView): RequestStatus {
  if (r.isExecuted) return "executed";
  if (r.isVetoed) return "vetoed";
  if (r.isContestable) return "contestable";
  return "executable";
}
