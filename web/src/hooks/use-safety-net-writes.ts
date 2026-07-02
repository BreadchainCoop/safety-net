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

type CreateInput = ContractFunctionArgs<
  typeof safetyNetAbi,
  "nonpayable",
  "create"
>[0];

export function useCreateSafetyNet() {
  const tx = useTx();
  const create = (safetyNet: CreateInput) =>
    tx.run({
      address: SAFETYNET_ADDRESS,
      abi: safetyNetAbi,
      functionName: "create",
      args: [safetyNet],
    });
  return { create, ...tx };
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
  const withdraw = (id: bigint, daysRequested: bigint) =>
    tx.run({
      address: SAFETYNET_ADDRESS,
      abi: safetyNetAbi,
      functionName: "withdraw",
      args: [id, daysRequested],
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
