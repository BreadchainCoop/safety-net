"use client";

import { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Heading1, Heading3, Body, LiftedButton } from "@breadcoop/ui";
import { useConnectedUser } from "@breadcoop/ui";
import { parseUnits, parseEventLogs, Address, maxUint256, encodeFunctionData } from "viem";
import { useReadContract } from "wagmi";
import { safetyNetAbi } from "@/lib/abis/safety-net";
import { erc20Abi } from "@/lib/abis/erc20";
import { SAFETY_NET_ADDRESS, BREAD_TOKEN_ADDRESS } from "@/lib/constants";
import { getDefaultChainId } from "@/utils/chain";
import { useModal } from "@/components/modal/context";
import { useSafetyNetTx } from "@/hooks/use-safety-net-tx";
import { useSponsoredTx } from "@/hooks/use-sponsored-tx";
import { useWaitForTxReceipt } from "@/hooks/use-wait-for-tx-receipt";

interface FormData {
  minimumMembers: number;
  maximumMembers: number;
  consensusThreshold: number;
  safetyNetStart: string;
  token: string;
  initialDeposit: string;
  fixedDeposit: string;
  redeemRatio: number;
  autoThreshold: string;
  contestWindow: number;
  votingWindow: number;
  epochDuration: number;
  smallWithdrawsLimit: number;
}

const defaults: FormData = {
  minimumMembers: 2,
  maximumMembers: 10,
  consensusThreshold: 66,
  safetyNetStart: "",
  token: BREAD_TOKEN_ADDRESS,
  initialDeposit: "10",
  fixedDeposit: "5",
  redeemRatio: 9,
  autoThreshold: "50",
  contestWindow: 24,
  votingWindow: 48,
  epochDuration: 30,
  smallWithdrawsLimit: 3,
};

export default function CreateFundPage() {
  const { user } = useConnectedUser();
  const router = useRouter();
  const { setModal } = useModal();
  const { sendSafetyNetTx } = useSafetyNetTx();
  const { sendSponsoredTransaction } = useSponsoredTx();
  const { waitForTxReceipt } = useWaitForTxReceipt();
  const chainId = getDefaultChainId();
  const [step, setStep] = useState(0);

  const methods = useForm<FormData>({ defaultValues: defaults });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = methods;

  const tokenAddress = watch("token") as Address;

  const { data: isAllowed } = useReadContract({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "isTokenAllowed",
    args: [tokenAddress],
    chainId,
    query: { enabled: !!tokenAddress },
  });

  const isConnected = user.status === "CONNECTED";
  if (!isConnected) {
    return (
      <div className="py-20 text-center">
        <Heading3>Connect your wallet to create a fund.</Heading3>
      </div>
    );
  }

  const onSubmit = async (data: FormData) => {
    try {
      setModal({ type: "FUND_CREATION_INIT", status: "awaiting" });

      const startTimestamp = BigInt(
        Math.floor(new Date(data.safetyNetStart).getTime() / 1000)
      );
      const initialDepositWei = parseUnits(data.initialDeposit, 18);
      const fixedDepositWei = parseUnits(data.fixedDeposit, 18);
      const autoThresholdWei = parseUnits(data.autoThreshold, 18);
      const epochDurationSeconds = BigInt(data.epochDuration) * 86400n;
      const contestWindowSeconds = BigInt(data.contestWindow) * 3600n;
      const votingWindowSeconds = BigInt(data.votingWindow) * 3600n;

      // Approve initial deposit
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [SAFETY_NET_ADDRESS, maxUint256],
      });
      const { hash: approveHash } = await sendSponsoredTransaction({
        to: data.token as Address,
        data: approveData,
      });
      await waitForTxReceipt(approveHash);

      setModal({ type: "FUND_CREATION_INIT", status: "approved" });

      const safetyNetStruct = {
        id: 0n,
        owner: user.address as Address,
        minimumMembers: BigInt(data.minimumMembers),
        maximumMembers: BigInt(data.maximumMembers),
        consensusThreshold: BigInt(data.consensusThreshold),
        safetyNetStart: startTimestamp,
        token: data.token as Address,
        members: [user.address as Address],
        initialDeposit: initialDepositWei,
        fixedDeposit: fixedDepositWei,
        redeemRatio: BigInt(data.redeemRatio),
        autoThreshold: autoThresholdWei,
        contestWindow: contestWindowSeconds,
        votingWindow: votingWindowSeconds,
        epochDuration: epochDurationSeconds,
        smallWithdrawsLimit: BigInt(data.smallWithdrawsLimit),
      };

      const receipt = await sendSafetyNetTx({
        functionName: "create",
        args: [safetyNetStruct],
      });

      if (receipt) {
        const logs = parseEventLogs({
          abi: safetyNetAbi,
          logs: receipt.logs,
          eventName: "SafetyNetCreated",
        });
        const newId = logs[0]?.args?.id;
        setModal({
          type: "FUND_CREATION_SUCCESS",
          fundId: newId?.toString() ?? "0",
        });
        setTimeout(() => {
          setModal(null);
          router.push(`/fund/${newId?.toString()}`);
        }, 2000);
      }
    } catch (e) {
      setModal({
        type: "FUND_CREATION_FAILED",
        msg: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Heading1 className="mb-6">Create a Fund</Heading1>

        {step === 0 && (
          <div className="card-shadow-bg rounded-xl p-6 space-y-4">
            <Heading3>Basic Settings</Heading3>

            <Field label="Token Address">
              <input
                {...register("token", { required: "Required" })}
                className="input-field"
                placeholder="0x..."
              />
              {isAllowed === false && (
                <p className="text-red-500 text-sm mt-1">
                  This token is not allowed.
                </p>
              )}
              <ErrorMsg msg={errors.token?.message} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Min Members">
                <input
                  type="number"
                  {...register("minimumMembers", {
                    valueAsNumber: true,
                    min: { value: 2, message: "Min 2" },
                  })}
                  className="input-field"
                />
                <ErrorMsg msg={errors.minimumMembers?.message} />
              </Field>
              <Field label="Max Members">
                <input
                  type="number"
                  {...register("maximumMembers", {
                    valueAsNumber: true,
                    min: { value: 2, message: "Min 2" },
                  })}
                  className="input-field"
                />
                <ErrorMsg msg={errors.maximumMembers?.message} />
              </Field>
            </div>

            <Field label="Consensus Threshold (%)">
              <input
                type="number"
                {...register("consensusThreshold", {
                  valueAsNumber: true,
                  min: { value: 1, message: "Min 1%" },
                  max: { value: 100, message: "Max 100%" },
                })}
                className="input-field"
              />
              <ErrorMsg msg={errors.consensusThreshold?.message} />
            </Field>

            <Field label="Start Date">
              <input
                type="datetime-local"
                {...register("safetyNetStart", { required: "Required" })}
                className="input-field"
              />
              <ErrorMsg msg={errors.safetyNetStart?.message} />
            </Field>

            <Field label="Epoch Duration (days)">
              <input
                type="number"
                {...register("epochDuration", {
                  valueAsNumber: true,
                  min: { value: 1, message: "Min 1 day" },
                })}
                className="input-field"
              />
              <ErrorMsg msg={errors.epochDuration?.message} />
            </Field>

            <LiftedButton
              type="button"
              width="full"
              onClick={() => setStep(1)}
            >
              Continue
            </LiftedButton>
          </div>
        )}

        {step === 1 && (
          <div className="card-shadow-bg rounded-xl p-6 space-y-4">
            <Heading3>Financial Settings</Heading3>

            <Field label="Initial Deposit (tokens)">
              <input
                {...register("initialDeposit", { required: "Required" })}
                className="input-field"
                placeholder="10"
              />
              <ErrorMsg msg={errors.initialDeposit?.message} />
            </Field>

            <Field label="Fixed Deposit per Epoch (tokens)">
              <input
                {...register("fixedDeposit", { required: "Required" })}
                className="input-field"
                placeholder="5"
              />
              <ErrorMsg msg={errors.fixedDeposit?.message} />
            </Field>

            <Field label={`Redeem Ratio (1-22): ${watch("redeemRatio")}`}>
              <input
                type="range"
                min={1}
                max={22}
                {...register("redeemRatio", { valueAsNumber: true })}
                className="w-full"
              />
              <Body className="text-sm text-gray-500">
                Withdrawal multiplier: deposits x {watch("redeemRatio")}
              </Body>
            </Field>

            <Field label="Auto-Approve Threshold (tokens)">
              <input
                {...register("autoThreshold", { required: "Required" })}
                className="input-field"
                placeholder="50"
              />
              <Body className="text-sm text-gray-500">
                Withdrawals below this amount are auto-approved.
              </Body>
              <ErrorMsg msg={errors.autoThreshold?.message} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Contest Window (hours)">
                <input
                  type="number"
                  {...register("contestWindow", {
                    valueAsNumber: true,
                    min: { value: 1, message: "Min 1h" },
                  })}
                  className="input-field"
                />
                <ErrorMsg msg={errors.contestWindow?.message} />
              </Field>
              <Field label="Voting Window (hours)">
                <input
                  type="number"
                  {...register("votingWindow", {
                    valueAsNumber: true,
                    min: { value: 1, message: "Min 1h" },
                  })}
                  className="input-field"
                />
                <ErrorMsg msg={errors.votingWindow?.message} />
              </Field>
            </div>

            <Field label="Small Withdrawals per Epoch">
              <input
                type="number"
                {...register("smallWithdrawsLimit", {
                  valueAsNumber: true,
                  min: { value: 1, message: "Min 1" },
                })}
                className="input-field"
              />
              <ErrorMsg msg={errors.smallWithdrawsLimit?.message} />
            </Field>

            <div className="flex gap-4">
              <LiftedButton
                type="button"
                width="full"
                onClick={() => setStep(0)}
                className="bg-gray-200! text-gray-800!"
              >
                Back
              </LiftedButton>
              <LiftedButton type="submit" width="full">
                Create Fund
              </LiftedButton>
            </div>
          </div>
        )}
      </form>
    </FormProvider>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function ErrorMsg({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-red-500 text-sm">{msg}</p>;
}
