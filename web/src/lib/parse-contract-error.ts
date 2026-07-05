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
  const lower = message.toLowerCase();

  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request")
  )
    return "Rejected in wallet.";

  for (const [name, friendly] of Object.entries(SAFETY_NET_ERRORS)) {
    if (message.includes(name)) return friendly;
  }

  // Network / RPC failures (fetch, timeout, CORS, HTTP) — distinct from a
  // contract revert, and actionable ("try again") rather than a hard failure.
  if (
    lower.includes("failed to fetch") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("network") ||
    lower.includes("fetch failed") ||
    /http (4|5)\d\d/.test(lower)
  )
    return "Network error reaching Gnosis — check your connection and try again.";

  if (lower.includes("insufficient funds"))
    return "Not enough gas (xDAI) to send this transaction.";

  if (error instanceof BaseError && error.shortMessage)
    return error.shortMessage;

  return fallback;
}
