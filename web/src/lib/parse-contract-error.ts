import { BaseError, ContractFunctionRevertedError } from "viem";
import { SAFETY_NET_ERRORS } from "@/lib/contract-errors";

/**
 * Converts a raw contract / wagmi error into a human-readable string.
 *
 * Resolution order:
 *  1. Walk the viem error chain for a decoded `ContractFunctionRevertedError`
 *     and look the custom error name up in SAFETY_NET_ERRORS.
 *  2. Detect user rejection (wallet prompt dismissed).
 *  3. String-match the message against all known error names (for reverts
 *     viem couldn't decode into a typed error).
 *  4. Fall back to viem's shortMessage, then a generic message.
 */
export function parseContractError(
  error: unknown,
  fallback = "Transaction failed. Please try again.",
): string {
  if (!error) return fallback;

  if (error instanceof BaseError) {
    const reverted = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? reverted.reason;
      if (name && SAFETY_NET_ERRORS[name]) return SAFETY_NET_ERRORS[name];
    }
  }

  const message = error instanceof Error ? error.message : String(error);

  if (message.toLowerCase().includes("user rejected"))
    return "Rejected in wallet.";

  for (const [name, friendly] of Object.entries(SAFETY_NET_ERRORS)) {
    if (message.includes(name)) return friendly;
  }

  if (error instanceof BaseError && error.shortMessage)
    return error.shortMessage;

  return fallback;
}
