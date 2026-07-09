"use client";

import { useAccount, useReadContract } from "wagmi";
import { zeroAddress, type Address, type Hex } from "viem";
import { safetyNetAbi } from "@/lib/abi/safety-net";
import { fluVerifierAbi } from "@/lib/abi/flu-verifier";
import { ADDRESSES, CHAIN_ID, isContractConfigured } from "@/lib/config";
import { useAddresses } from "@/components/addresses-provider";

/**
 * Reads for the ZK Email flu-claim path. The verifier address is read live from
 * SafetyNet.fluClaimVerifier so the UI follows the on-chain wiring (a flu claim
 * is impossible while it is unset), with the build-time config as a fallback.
 */

const REFETCH_MS = 12_000;

/** The wired flu verifier, or undefined when flu claims are disabled. */
export function useFluClaimVerifierAddress(): Address | undefined {
  const { safetyNet } = useAddresses();
  const { data } = useReadContract({
    address: safetyNet,
    abi: safetyNetAbi,
    chainId: CHAIN_ID,
    functionName: "fluClaimVerifier",
    query: { enabled: isContractConfigured() },
  });
  const onchain = data as Address | undefined;
  const resolved =
    onchain && onchain !== zeroAddress
      ? onchain
      : ADDRESSES.fluVerifier !== zeroAddress
        ? ADDRESSES.fluVerifier
        : undefined;
  return resolved;
}

type CommitmentState = {
  verifier: Address | undefined;
  commitment: Hex | undefined;
  setAt: bigint | undefined;
  commitmentDelay: bigint | undefined;
  /** True once the registered commitment has aged past the waiting period. */
  isReady: boolean;
  isRegistered: boolean;
};

/** The connected member's email-commitment state on the flu verifier. */
export function useEmailCommitment(): CommitmentState {
  const verifier = useFluClaimVerifierAddress();
  const { address } = useAccount();
  const enabled = Boolean(verifier) && Boolean(address);
  const base = { address: verifier as Address, abi: fluVerifierAbi, chainId: CHAIN_ID } as const;

  const { data: commitment } = useReadContract({
    ...base,
    functionName: "emailCommitments",
    args: [address ?? zeroAddress],
    query: { enabled, refetchInterval: REFETCH_MS },
  });
  const { data: setAt } = useReadContract({
    ...base,
    functionName: "emailCommitmentSetAt",
    args: [address ?? zeroAddress],
    query: { enabled },
  });
  const { data: commitmentDelay } = useReadContract({
    ...base,
    functionName: "commitmentDelay",
    query: { enabled },
  });

  const commitmentHex = commitment as Hex | undefined;
  const isRegistered = Boolean(commitmentHex) && BigInt(commitmentHex ?? "0x0") !== 0n;
  const setAtNum = setAt as bigint | undefined;
  const delayNum = commitmentDelay as bigint | undefined;
  const isReady =
    isRegistered &&
    setAtNum !== undefined &&
    delayNum !== undefined &&
    BigInt(Math.floor(Date.now() / 1000)) >= setAtNum + delayNum;

  return {
    verifier,
    commitment: commitmentHex,
    setAt: setAtNum,
    commitmentDelay: delayNum,
    isReady,
    isRegistered,
  };
}
