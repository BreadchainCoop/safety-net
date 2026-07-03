"use client";

import type { Address, ContractFunctionArgs } from "viem";
import { safetyNetAbi } from "@/lib/abi/safety-net";
import { SAFETYNET_ADDRESS } from "@/lib/config";
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
      address: SAFETYNET_ADDRESS,
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
      address: SAFETYNET_ADDRESS,
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
      address: SAFETYNET_ADDRESS,
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
      address: SAFETYNET_ADDRESS,
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
      address: SAFETYNET_ADDRESS,
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
      address: SAFETYNET_ADDRESS,
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
      address: SAFETYNET_ADDRESS,
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
      address: SAFETYNET_ADDRESS,
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
      address: SAFETYNET_ADDRESS,
      abi: safetyNetAbi,
      functionName: "redeemInvite",
      args: [invite, signature],
    });
  return { redeemInvite, ...tx };
}
