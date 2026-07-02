"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAccount } from "wagmi";
import { isAddress, type Address } from "viem";
import { Caption } from "@breadcoop/ui";
import { X } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { TxStatus } from "@/components/ui/tx-status";
import { Card } from "@/components/ui/ui";
import { AddressDisplay } from "@/components/ui/address-display";
import { useCreateSafetyNet } from "@/hooks/use-safety-net-writes";
import { useIsTokenAllowed } from "@/hooks/use-safety-net";
import { useTokenInfo } from "@/hooks/use-token";
import { BREAD_ADDRESS, WXDAI_ADDRESS } from "@/lib/config";
import { parseAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createNetSchema, type CreateNetValues } from "./schema";

const inputClass =
  "w-full rounded-xl border border-paper-2 bg-paper-main px-4 py-2.5 text-text-standard outline-none focus:border-primary-jade disabled:opacity-60";

function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Caption className="text-surface-grey-2">{label}</Caption>
      <div className="mt-1.5">{children}</div>
      {help && !error && (
        <p className="text-surface-grey mt-1.5 text-xs">{help}</p>
      )}
      {error && (
        <p className="text-system-red mt-1.5 text-xs font-medium">{error}</p>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-breadDisplay text-text-standard mt-2 text-lg font-bold uppercase">
      {children}
    </h3>
  );
}

/** datetime-local string for "now" in the local timezone. */
function nowLocalDateTime(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateForm() {
  const { address } = useAccount();
  const { create, status, hash, error: txError, isBusy } = useCreateSafetyNet();
  const [memberInput, setMemberInput] = useState("");
  const [memberInputError, setMemberInputError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateNetValues>({
    resolver: zodResolver(createNetSchema),
    defaultValues: {
      members: [],
      tokenChoice: "wxdai",
      customToken: "",
      initialDeposit: "",
      fixedDeposit: "",
      redeemRatio: 10,
      autoThreshold: "",
      contestThreshold: 50,
      contestWindowDays: 3,
      epochDurationDays: 30,
      smallWithdrawsLimit: 3,
      startTime: "",
      minimumMembers: 2,
      maximumMembers: 10,
    },
  });

  // Prefill: creator is a member; start time defaults to "now" (client-side
  // to avoid a static-export hydration mismatch).
  useEffect(() => {
    if (address && watch("members").length === 0)
      setValue("members", [address]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);
  useEffect(() => {
    if (!watch("startTime")) setValue("startTime", nowLocalDateTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const members = watch("members");
  const tokenChoice = watch("tokenChoice");
  const customToken = watch("customToken");

  const token: Address | undefined = useMemo(() => {
    if (tokenChoice === "wxdai") return WXDAI_ADDRESS;
    if (tokenChoice === "bread") return BREAD_ADDRESS;
    return isAddress(customToken) ? customToken : undefined;
  }, [tokenChoice, customToken]);

  const { symbol, decimals } = useTokenInfo(token);
  const { data: tokenAllowed } = useIsTokenAllowed(token);

  const addMember = () => {
    const candidate = memberInput.trim();
    setMemberInputError(null);
    if (!isAddress(candidate)) {
      setMemberInputError("Not a valid address");
      return;
    }
    if (members.some((m) => m.toLowerCase() === candidate.toLowerCase())) {
      setMemberInputError("Already in the list");
      return;
    }
    setValue("members", [...members, candidate], { shouldValidate: true });
    setMemberInput("");
  };

  const removeMember = (m: string) =>
    setValue(
      "members",
      members.filter((x) => x !== m),
      { shouldValidate: true },
    );

  const onSubmit = handleSubmit((v) => {
    if (!address || !token) return;
    const initialDeposit = parseAmount(v.initialDeposit, decimals);
    const fixedDeposit = parseAmount(v.fixedDeposit, decimals);
    const autoThreshold = parseAmount(v.autoThreshold, decimals);
    if (
      initialDeposit === null ||
      fixedDeposit === null ||
      autoThreshold === null
    )
      return;

    create({
      id: 0n, // assigned by the contract
      owner: address,
      minimumMembers: BigInt(v.minimumMembers),
      maximumMembers: BigInt(v.maximumMembers),
      contestThreshold: BigInt(v.contestThreshold),
      safetyNetStart: BigInt(Math.floor(Date.parse(v.startTime) / 1000)),
      token,
      members: v.members as Address[],
      initialDeposit,
      fixedDeposit,
      redeemRatio: BigInt(v.redeemRatio),
      autoThreshold,
      contestWindow: BigInt(Math.round(v.contestWindowDays * 86_400)),
      epochDuration: BigInt(Math.round(v.epochDurationDays * 86_400)),
      smallWithdrawsLimit: BigInt(v.smallWithdrawsLimit),
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="flex flex-col gap-5">
        <SectionTitle>Members</SectionTitle>
        <Field
          label="Founding members"
          help="Everyone listed here is a member from day one. You can invite more people later with a signed invite link."
          error={memberInputError ?? errors.members?.message}
        >
          <div className="flex gap-2">
            <input
              className={inputClass}
              placeholder="0x… member address"
              value={memberInput}
              onChange={(e) => setMemberInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMember();
                }
              }}
            />
            <button
              type="button"
              onClick={addMember}
              className="bg-primary-jade hover:bg-jade-2 shrink-0 rounded-xl px-4 font-bold text-white transition-colors"
            >
              Add
            </button>
          </div>
          {members.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {members.map((m) => (
                <span
                  key={m}
                  className="bg-paper-2 inline-flex items-center gap-1.5 rounded-full py-1 pr-2 pl-3"
                >
                  <AddressDisplay address={m as Address} />
                  {m.toLowerCase() === address?.toLowerCase() && (
                    <span className="text-surface-grey text-xs">(you)</span>
                  )}
                  <button
                    type="button"
                    title="Remove"
                    onClick={() => removeMember(m)}
                    className="text-surface-grey hover:text-system-red"
                  >
                    <X size={13} weight="bold" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Minimum members"
            help="Smallest group size for the net to make sense (contract minimum: 2)."
            error={errors.minimumMembers?.message}
          >
            <input
              type="number"
              min={2}
              className={inputClass}
              {...register("minimumMembers", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Maximum members"
            help="Invites stop working once the group reaches this size."
            error={errors.maximumMembers?.message}
          >
            <input
              type="number"
              min={2}
              className={inputClass}
              {...register("maximumMembers", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <SectionTitle>Money</SectionTitle>
        <Field
          label="Token"
          help="The ERC20 everyone saves in. It must be allowed by the protocol."
          error={errors.customToken?.message}
        >
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["wxdai", "WXDAI"],
                ["bread", "BREAD"],
                ["custom", "Custom"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setValue("tokenChoice", value, { shouldValidate: true })
                }
                className={cn(
                  "rounded-xl border px-4 py-2 text-sm font-bold transition-colors",
                  tokenChoice === value
                    ? "border-primary-jade bg-primary-jade text-white"
                    : "border-paper-2 text-surface-grey-2 hover:border-primary-jade/50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tokenChoice === "custom" && (
            <input
              className={`${inputClass} mt-2`}
              placeholder="0x… token address"
              {...register("customToken")}
            />
          )}
          {token && tokenAllowed === false && (
            <p className="text-system-warning mt-1.5 text-xs font-medium">
              This token is not currently allowed by the SafetyNet protocol —
              creation will fail until the protocol owner allows it.
            </p>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={`Initial deposit (${symbol})`}
            help="One-off joining payment. A new member's very first deposit must be exactly this amount, in a single payment."
            error={errors.initialDeposit?.message}
          >
            <input
              inputMode="decimal"
              placeholder="0.0"
              className={inputClass}
              {...register("initialDeposit")}
            />
          </Field>
          <Field
            label={`Recurring deposit (${symbol})`}
            help="Dues each member owes every epoch after joining. Can be paid in several partial payments."
            error={errors.fixedDeposit?.message}
          >
            <input
              inputMode="decimal"
              placeholder="0.0"
              className={inputClass}
              {...register("fixedDeposit")}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Redeem ratio (1–22)"
            help="Withdrawal power multiplier: every 1 token deposited unlocks this many tokens of withdrawable balance."
            error={errors.redeemRatio?.message}
          >
            <input
              type="number"
              min={1}
              max={22}
              className={inputClass}
              {...register("redeemRatio", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Epoch length (days)"
            help="How often the recurring deposit is due. 30 days ≈ monthly."
            error={errors.epochDurationDays?.message}
          >
            <input
              type="number"
              min={1}
              className={inputClass}
              {...register("epochDurationDays", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <SectionTitle>Withdrawals</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={`Instant-withdrawal threshold (${symbol})`}
            help="Withdrawals up to this amount are paid out instantly. Anything larger becomes a request the group can contest."
            error={errors.autoThreshold?.message}
          >
            <input
              inputMode="decimal"
              placeholder="0.0"
              className={inputClass}
              {...register("autoThreshold")}
            />
          </Field>
          <Field
            label="Instant withdrawals per epoch"
            help="How many instant (small) withdrawals each member may make per epoch."
            error={errors.smallWithdrawsLimit?.message}
          >
            <input
              type="number"
              min={1}
              className={inputClass}
              {...register("smallWithdrawsLimit", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Contest threshold (%)"
            help="A large withdrawal is vetoed when MORE than this percentage of members contest it."
            error={errors.contestThreshold?.message}
          >
            <input
              type="number"
              min={1}
              max={100}
              className={inputClass}
              {...register("contestThreshold", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Contest window (days)"
            help="How long the group has to contest a large withdrawal before it becomes executable."
            error={errors.contestWindowDays?.message}
          >
            <input
              type="number"
              min={0}
              step="any"
              className={inputClass}
              {...register("contestWindowDays", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <SectionTitle>Schedule</SectionTitle>
        <Field
          label="Start time"
          help="Deposits open at this time; epochs are counted from it."
          error={errors.startTime?.message}
        >
          <input
            type="datetime-local"
            className={inputClass}
            {...register("startTime")}
          />
        </Field>

        <div className="mt-2">
          <ActionButton
            onClick={onSubmit}
            isLoading={isBusy}
            disabled={status === "success"}
          >
            Create Safety Net
          </ActionButton>
          <TxStatus
            status={status}
            hash={hash}
            error={txError}
            successLabel="Safety Net created — it will appear on your dashboard shortly."
          />
        </div>
      </Card>
    </form>
  );
}
