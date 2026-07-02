"use client";

import { useState } from "react";
import { useSignTypedData } from "wagmi";
import {
  buildJoinLink,
  inviteDomain,
  inviteTypes,
  randomNonce,
} from "@/lib/eip712";
import { parseContractError } from "@/lib/parse-contract-error";

export interface SignedInvite {
  nonce: bigint;
  signature: `0x${string}`;
  link: string;
}

/**
 * Owner-side invite generation: signs the EIP-712 Invite struct
 * (domain "SafetyNetInvite" v1) and produces a shareable /join link.
 */
export function useSignInvite() {
  const { signTypedDataAsync, isPending } = useSignTypedData();
  const [error, setError] = useState<string | null>(null);

  const sign = async (safetyNetId: bigint): Promise<SignedInvite | null> => {
    setError(null);
    try {
      const nonce = randomNonce();
      const signature = await signTypedDataAsync({
        domain: inviteDomain(),
        types: inviteTypes,
        primaryType: "Invite",
        message: { safetyNetId, nonce },
      });
      return {
        nonce,
        signature,
        link: buildJoinLink(safetyNetId, nonce, signature),
      };
    } catch (e) {
      setError(parseContractError(e, "Signature failed."));
      return null;
    }
  };

  return { sign, isPending, error };
}
