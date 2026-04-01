import { Address } from "viem";

export const INVITE_DOMAIN_NAME = "SafetyNetInvite";
export const INVITE_DOMAIN_VERSION = "1";

export function buildInviteTypedData(
  safetyNetId: bigint,
  nonce: bigint,
  chainId: number,
  contractAddress: Address
) {
  return {
    domain: {
      name: INVITE_DOMAIN_NAME,
      version: INVITE_DOMAIN_VERSION,
      chainId,
      verifyingContract: contractAddress,
    },
    types: {
      Invite: [
        { name: "safetyNetId", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "Invite" as const,
    message: {
      safetyNetId,
      nonce,
    },
  };
}

export function buildInviteUrl(
  baseUrl: string,
  contractAddress: string,
  safetyNetId: bigint,
  nonce: bigint,
  signature: string
): string {
  const url = new URL("/fund/join", baseUrl);
  url.searchParams.set("contract", contractAddress);
  url.searchParams.set("id", safetyNetId.toString());
  url.searchParams.set("nonce", nonce.toString());
  url.searchParams.set("sig", signature);
  return url.toString();
}
