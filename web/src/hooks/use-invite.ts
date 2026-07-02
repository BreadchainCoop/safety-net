"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import {
  buildJoinLink,
  inviteDomain,
  inviteTypes,
  randomNonce,
} from "@/lib/eip712";
import { CHAIN_ID, SAFETYNET_ADDRESS } from "@/lib/config";
import { parseContractError } from "@/lib/parse-contract-error";

/**
 * A generated invite persisted in this browser. app-stacks keeps its invite
 * links in Supabase (stacks_metadata.invite_links, marked used via an API
 * route); we are a static export with no backend, so localStorage is the
 * local-first equivalent. The authoritative used/unused state always comes
 * from usedNonces on-chain — storage only remembers what was signed here.
 */
export interface StoredInvite {
  /** Invite nonce as a decimal string (JSON-safe). */
  nonce: string;
  signature: `0x${string}`;
  createdAt: number;
}

const storageKey = (safetyNetId: bigint, signer: string) =>
  `safety-net:invites:${CHAIN_ID}:${SAFETYNET_ADDRESS.toLowerCase()}:${safetyNetId.toString()}:${signer.toLowerCase()}`;

function loadInvites(key: string): StoredInvite[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredInvite[]) : [];
  } catch {
    return [];
  }
}

function saveInvites(key: string, invites: StoredInvite[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(invites));
  } catch {
    // Storage may be unavailable (private mode) — the session list still works.
  }
}

/** Shareable /join link for a stored invite. */
export function inviteLink(safetyNetId: bigint, invite: StoredInvite): string {
  return buildJoinLink(safetyNetId, BigInt(invite.nonce), invite.signature);
}

/**
 * Owner-side invite generation and tracking (app-stacks stack-result.tsx
 * pattern): signs one EIP-712 Invite (domain "SafetyNetInvite" v1) per link
 * with per-step progress feedback, and persists the generated list per
 * net + signer so the invite panel can show accepted/pending status across
 * sessions. Nonces are 128-bit random (see randomNonce) instead of
 * app-stacks' sequential timestamps, so no usedNonces pre-check is needed.
 */
export function useInviteLinks(safetyNetId: bigint | undefined) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [invites, setInvites] = useState<StoredInvite[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key =
    address && safetyNetId !== undefined
      ? storageKey(safetyNetId, address)
      : null;

  // Load persisted invites client-side (no localStorage at static build time).
  useEffect(() => {
    setInvites(key ? loadInvites(key) : []);
  }, [key]);

  /** Signs `count` invites sequentially; keeps whatever was signed on abort. */
  const generate = async (count: number) => {
    if (!key || safetyNetId === undefined) return;
    setError(null);
    const generated: StoredInvite[] = [];
    try {
      for (let i = 0; i < count; i++) {
        setProgress(`Signing invite ${i + 1} of ${count}…`);
        const nonce = randomNonce();
        const signature = await signTypedDataAsync({
          domain: inviteDomain(),
          types: inviteTypes,
          primaryType: "Invite",
          message: { safetyNetId, nonce },
        });
        generated.push({
          nonce: nonce.toString(),
          signature,
          createdAt: Date.now(),
        });
      }
    } catch (e) {
      setError(parseContractError(e, "Signature failed."));
    } finally {
      setProgress(null);
      if (generated.length > 0) {
        const next = [...invites, ...generated];
        saveInvites(key, next);
        setInvites(next);
      }
    }
  };

  return {
    invites,
    generate,
    progress,
    isGenerating: progress !== null,
    error,
  };
}
