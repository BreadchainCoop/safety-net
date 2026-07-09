"use client";

import type { Address, ContractFunctionArgs, Hex } from "viem";
import { safetyNetAbi } from "@/lib/abi/safety-net";
import { fluVerifierAbi } from "@/lib/abi/flu-verifier";
import { ADDRESSES } from "@/lib/config";
import { useTx } from "@/hooks/use-tx";

/**
 * One thin write-hook per SafetyNet action, all sharing the useTx state
 * machine. Components use the returned tx fields (status/hash/error) to
 * render inline lifecycle feedback.
 */

// create(string _name, SafetyNet _safetyNet) — name is the first arg.
type CreateArgs = ContractFunctionArgs<
  typeof safetyNetAbi,
  "nonpayable",
  "create"
>;
type CreateName = CreateArgs[0];
type CreateInput = CreateArgs[1];

export function useCreateSafetyNet() {
  const tx = useTx();
  const create = (name: CreateName, safetyNet: CreateInput) =>
    tx.run({
      address: ADDRESSES.safetyNet,
      abi: safetyNetAbi,
      functionName: "create",
      args: [name, safetyNet],
    });
  return { create, ...tx };
}

/**
 * Owner-only: starts a pending Safety Net once at least minimumMembers have
 * joined — membership locks and epoch 1 dues begin at the block timestamp.
 */
export function useStartSafetyNet() {
  const tx = useTx();
  const start = (id: bigint) =>
    tx.run({
      address: ADDRESSES.safetyNet,
      abi: safetyNetAbi,
      functionName: "start",
      args: [id],
    });
  return { start, ...tx };
}

export function useDeposit() {
  const tx = useTx();
  const deposit = (id: bigint, value: bigint) =>
    tx.run({
      address: ADDRESSES.safetyNet,
      abi: safetyNetAbi,
      functionName: "deposit",
      args: [id, value],
    });
  return { deposit, ...tx };
}

export function useDepositFor() {
  const tx = useTx();
  const depositFor = (id: bigint, value: bigint, member: Address) =>
    tx.run({
      address: ADDRESSES.safetyNet,
      abi: safetyNetAbi,
      functionName: "depositFor",
      args: [id, value, member],
    });
  return { depositFor, ...tx };
}

export function useWithdraw() {
  const tx = useTx();
  const withdraw = (id: bigint, daysRequested: bigint, reason: string) =>
    tx.run({
      address: ADDRESSES.safetyNet,
      abi: safetyNetAbi,
      functionName: "withdraw",
      args: [id, daysRequested, reason],
    });
  return { withdraw, ...tx };
}

export function useContest() {
  const tx = useTx();
  const contest = (requestId: bigint) =>
    tx.run({
      address: ADDRESSES.safetyNet,
      abi: safetyNetAbi,
      functionName: "contest",
      args: [requestId],
    });
  return { contest, ...tx };
}

export function useExecuteContestedWithdrawal() {
  const tx = useTx();
  const execute = (requestId: bigint) =>
    tx.run({
      address: ADDRESSES.safetyNet,
      abi: safetyNetAbi,
      functionName: "executeContestedWithdrawal",
      args: [requestId],
    });
  return { execute, ...tx };
}

export function useDecommission() {
  const tx = useTx();
  const decommission = (id: bigint) =>
    tx.run({
      address: ADDRESSES.safetyNet,
      abi: safetyNetAbi,
      functionName: "decommission",
      args: [id],
    });
  return { decommission, ...tx };
}

export function useRedeemInvite() {
  const tx = useTx();
  const redeemInvite = (
    invite: { safetyNetId: bigint; nonce: bigint },
    signature: `0x${string}`,
  ) =>
    tx.run({
      address: ADDRESSES.safetyNet,
      abi: safetyNetAbi,
      functionName: "redeemInvite",
      args: [invite, signature],
    });
  return { redeemInvite, ...tx };
}

/**
 * Settles a flu claim instantly against a ZK Email proof (skips the contest
 * phase). `proof` is the ABI-encoded IZkEmailFluVerifier.FluClaimProof from
 * `encodeFluClaimProof`.
 */
export function useClaimFlu() {
  const tx = useTx();
  const claimFlu = (id: bigint, proof: Hex) =>
    tx.run({
      address: ADDRESSES.safetyNet,
      abi: safetyNetAbi,
      functionName: "claimFlu",
      args: [id, proof],
    });
  return { claimFlu, ...tx };
}

/**
 * Registers the caller's email commitment on the flu verifier. Members do this
 * once (ideally at join time); the commitment must age past the verifier's
 * waiting period before it can back a claim.
 */
export function useRegisterEmailCommitment(verifier: Address) {
  const tx = useTx();
  const registerEmailCommitment = (commitment: Hex) =>
    tx.run({
      address: verifier,
      abi: fluVerifierAbi,
      functionName: "registerEmailCommitment",
      args: [commitment],
    });
  return { registerEmailCommitment, ...tx };
}
