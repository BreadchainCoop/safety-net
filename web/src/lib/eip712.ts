import type { Address } from "viem";
import { CHAIN_ID, SAFETYNET_ADDRESS } from "@/lib/config";

/**
 * EIP-712 domains/types for SafetyNet signatures. Values mirror the contract:
 * invites are signed under domain "SafetyNetInvite" v1 and withdraw-request
 * authorizations under "SafetyNetRequest" v1 (both bound to chain 100 and the
 * proxy address).
 */
export const inviteDomain = (verifyingContract: Address = SAFETYNET_ADDRESS) =>
  ({
    name: "SafetyNetInvite",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract,
  }) as const;

export const inviteTypes = {
  Invite: [
    { name: "safetyNetId", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const requestAuthorizationDomain = (
  verifyingContract: Address = SAFETYNET_ADDRESS,
) =>
  ({
    name: "SafetyNetRequest",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract,
  }) as const;

// Mirrors the contract's typehash exactly (field order matters for EIP-712):
// RequestAuthorization(uint256 safetyNetId,uint256 amount,uint256 nonce,uint256 deadline,string reason)
export const requestAuthorizationTypes = {
  RequestAuthorization: [
    { name: "safetyNetId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "reason", type: "string" },
  ],
} as const;

/** Random uint256-ish nonce (128 bits of browser entropy). */
export function randomNonce(): bigint {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
}

/** Builds a shareable /join link for a signed invite. */
export function buildJoinLink(
  safetyNetId: bigint,
  nonce: bigint,
  signature: `0x${string}`,
): string {
  const base = typeof window === "undefined" ? "" : window.location.origin;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}${basePath}/join/?net=${safetyNetId}&nonce=${nonce}&sig=${signature}`;
}
