"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  FormProvider,
  useForm,
  useFormContext,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAccount } from "wagmi";
import { isAddress, parseEventLogs, type Address } from "viem";
import { Body, Button, Caption, Heading2, Heading4, Logo } from "@breadcoop/ui";
import { ArrowLeft, ArrowRight, CaretDown, CheckCircle } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { TxStatus } from "@/components/ui/tx-status";
import { Card } from "@/components/ui/ui";
import { useCreateSafetyNet } from "@/hooks/use-safety-net-writes";
import { useIsTokenAllowed } from "@/hooks/use-safety-net";
import { useTokenInfo } from "@/hooks/use-token";
import { safetyNetAbi } from "@/lib/abi/safety-net";
import { BREAD_ADDRESS, REDEEM_RATIO } from "@/lib/config";
import { parseAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createNetSchema, type CreateNetValues } from "./schema";
import { SuccessInvites } from "./success-invites";

const inputClass =
  "w-full rounded-xl border border-paper-2 bg-paper-main px-4 py-2.5 text-text-standard outline-none focus:border-primary-jade disabled:opacity-60";

/**
 * Sensible governance defaults so a user can create a working net without
 * ever opening "Advanced settings":
 *  - contestThreshold 50 (%)  → a large withdrawal is vetoed only if a
 *    majority contests it.
 *  - contestWindowDays 3      → three days to object before it executes.
 *  - smallWithdrawsLimit 3    → three instant withdrawals per member per epoch.
 *  - autoThreshold ""         → left blank; the Advanced section pre-fills a
 *    suggestion (a quarter of the recurring deposit) the first time it opens.
 *  - minimumMembers 2         → the contract minimum that gates start().
 */
const DEFAULTS = {
  memberCount: 10,
  contestThreshold: 50,
  contestWindowDays: 3,
  epochDurationDays: 30,
  smallWithdrawsLimit: 3,
  minimumMembers: 2,
} as const;

type NetForm = UseFormReturn<CreateNetValues>;

function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  /** Control id — the label points at it; help/error get `${id}-help/-error`. */
  id?: string;
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id}>
        <Caption className="text-surface-grey-2">{label}</Caption>
      </label>
      <div className="mt-1.5">{children}</div>
      {help && !error && (
        <p id={id ? `${id}-help` : undefined} className="text-surface-grey mt-1.5 text-xs">
          {help}
        </p>
      )}
      {error && (
        <p
          id={id ? `${id}-error` : undefined}
          className="text-system-red mt-1.5 text-xs font-medium"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** aria wiring for an input inside a <Field id={id} …>. */
function fieldAria(id: string, error?: string, help?: string) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error
      ? `${id}-error`
      : help
        ? `${id}-help`
        : undefined,
  };
}

/** BREAD square logo suffixed inside an amount input (or plain symbol text). */
function AmountSuffix({ isBread, symbol }: { isBread: boolean; symbol: string }) {
  return (
    <div className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
      {isBread ? (
        <Logo size={20} variant="square" color="jade" />
      ) : (
        <span className="text-surface-grey text-sm font-bold">{symbol}</span>
      )}
    </div>
  );
}

export function CreateForm() {
  const form = useForm<CreateNetValues>({
    resolver: zodResolver(createNetSchema),
    defaultValues: {
      memberCount: DEFAULTS.memberCount,
      tokenChoice: "bread",
      customToken: "",
      initialDeposit: "",
      fixedDeposit: "",
      redeemRatio: REDEEM_RATIO,
      autoThreshold: "",
      contestThreshold: DEFAULTS.contestThreshold,
      contestWindowDays: DEFAULTS.contestWindowDays,
      epochDurationDays: DEFAULTS.epochDurationDays,
      smallWithdrawsLimit: DEFAULTS.smallWithdrawsLimit,
      minimumMembers: DEFAULTS.minimumMembers,
    },
  });

  // Mobile step flow: fill the form → Continue → review the Overview → Create.
  // On lg+ both panels are always visible (this flag is ignored there).
  const [showOverview, setShowOverview] = useState(false);

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={(e) => e.preventDefault()}>
        <header className="mb-6">
          <Heading2 className="text-primary-jade">New Safety Net</Heading2>
          <Body className="text-surface-grey-2 mt-2">
            Set the rules of your group fund — who&apos;s in, what everyone
            contributes, and how withdrawals are approved.
          </Body>
        </header>

        <div className="lg:flex lg:items-start lg:gap-6">
          <div className={cn("flex-1", showOverview && "hidden lg:block")}>
            <FormPanel onContinue={() => setShowOverview(true)} />
          </div>
          <div className={cn("mt-6 flex-1 lg:mt-0", !showOverview && "hidden lg:block")}>
            <OverviewPanel onBack={() => setShowOverview(false)} />
          </div>
        </div>
      </form>
    </FormProvider>
  );
}

/** Left panel: essentials up front, finer governance behind "Advanced". */
function FormPanel({ onContinue }: { onContinue: () => void }) {
  const form = useFormContext<CreateNetValues>();
  const {
    register,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors },
  } = form;
  const fid = useId();
  const id = (name: string) => `${fid}-${name}`;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedId = useId();

  const tokenChoice = watch("tokenChoice");
  const isBread = tokenChoice === "bread";
  const symbol = useNetSymbol(form);

  const continueToReview = async () => {
    if (await trigger()) onContinue();
  };

  const openAdvanced = () => {
    setAdvancedOpen((open) => {
      // Pre-fill a suggested instant-withdrawal threshold (¼ of the recurring
      // deposit) the first time Advanced opens, if the user left it blank.
      if (!open && !getValues("autoThreshold")) {
        const fixed = Number(getValues("fixedDeposit"));
        if (Number.isFinite(fixed) && fixed > 0) {
          setValue("autoThreshold", String(fixed / 4));
        }
      }
      return !open;
    });
  };

  return (
    <Card className="flex flex-col gap-5">
      <Field
        label="Token"
        help="The ERC20 everyone saves in. BREAD is the default; pick Custom for another allowed token."
        error={errors.customToken?.message}
      >
        <div role="group" aria-label="Token" className="flex flex-wrap gap-2">
          {(
            [
              ["bread", "BREAD"],
              ["custom", "Custom"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={tokenChoice === value}
              onClick={() =>
                setValue("tokenChoice", value, { shouldValidate: true })
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition-colors",
                tokenChoice === value
                  ? "border-primary-jade bg-primary-jade text-white"
                  : "border-paper-2 text-surface-grey-2 hover:border-primary-jade/50",
              )}
            >
              {value === "bread" && (
                <Logo
                  size={18}
                  variant="square"
                  color={tokenChoice === value ? "white" : "jade"}
                />
              )}
              {label}
            </button>
          ))}
        </div>
        {tokenChoice === "custom" && (
          <input
            aria-label="Custom token address"
            aria-invalid={errors.customToken ? true : undefined}
            className={`${inputClass} mt-2`}
            placeholder="0x… token address"
            {...register("customToken")}
          />
        )}
        <TokenAllowedWarning form={form} />
      </Field>

      <Field
        id={id("member-count")}
        label="Max members"
        help="You'll be the first member. Everyone else joins through invite links before you start the net."
        error={errors.memberCount?.message}
      >
        <input
          {...fieldAria(id("member-count"), errors.memberCount?.message, "help")}
          type="number"
          min={2}
          className={inputClass}
          {...register("memberCount", { valueAsNumber: true })}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id={id("initial-deposit")}
          label="Initial (join) deposit"
          help={
            isBread
              ? "One-off joining payment. 1 BREAD = 1 USD."
              : "One-off joining payment — a member's first deposit must be exactly this."
          }
          error={errors.initialDeposit?.message}
        >
          <div className="relative">
            <input
              {...fieldAria(
                id("initial-deposit"),
                errors.initialDeposit?.message,
                "help",
              )}
              inputMode="decimal"
              placeholder="0.0"
              className={`${inputClass} pr-14`}
              {...register("initialDeposit")}
            />
            <AmountSuffix isBread={isBread} symbol={symbol} />
          </div>
        </Field>
        <Field
          id={id("fixed-deposit")}
          label="Recurring deposit"
          help={
            isBread
              ? "Dues each member owes every epoch. 1 BREAD = 1 USD."
              : "Dues each member owes every epoch after joining."
          }
          error={errors.fixedDeposit?.message}
        >
          <div className="relative">
            <input
              {...fieldAria(
                id("fixed-deposit"),
                errors.fixedDeposit?.message,
                "help",
              )}
              inputMode="decimal"
              placeholder="0.0"
              className={`${inputClass} pr-14`}
              {...register("fixedDeposit")}
            />
            <AmountSuffix isBread={isBread} symbol={symbol} />
          </div>
        </Field>
      </div>

      <Field
        id={id("epoch-days")}
        label="Epoch length (days)"
        help="How often the recurring deposit is due. 30 days ≈ monthly."
        error={errors.epochDurationDays?.message}
      >
        <input
          {...fieldAria(id("epoch-days"), errors.epochDurationDays?.message, "help")}
          type="number"
          min={1}
          className={inputClass}
          {...register("epochDurationDays", { valueAsNumber: true })}
        />
      </Field>

      {/* Advanced settings — sensible defaults are pre-filled, so this stays
          closed for a typical net. */}
      <div className="border-paper-2 border-t pt-4">
        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          onClick={openAdvanced}
          className="text-surface-grey-2 hover:text-primary-jade flex w-full items-center justify-between text-sm font-bold transition-colors"
        >
          Advanced settings
          <CaretDown
            size={18}
            className={cn("transition-transform", advancedOpen && "rotate-180")}
          />
        </button>

        {advancedOpen && (
          <div id={advancedId} className="mt-4 flex flex-col gap-5">
            <Field
              id={id("min-members")}
              label="Minimum members to start"
              help="You can only start the net once this many members have joined (contract minimum: 2)."
              error={errors.minimumMembers?.message}
            >
              <input
                {...fieldAria(
                  id("min-members"),
                  errors.minimumMembers?.message,
                  "help",
                )}
                type="number"
                min={2}
                className={inputClass}
                {...register("minimumMembers", { valueAsNumber: true })}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id={id("auto-threshold")}
                label="Instant-withdrawal threshold"
                help="Withdrawals up to this amount are paid instantly; larger ones can be contested. Defaults to ¼ of the recurring deposit."
                error={errors.autoThreshold?.message}
              >
                <div className="relative">
                  <input
                    {...fieldAria(
                      id("auto-threshold"),
                      errors.autoThreshold?.message,
                      "help",
                    )}
                    inputMode="decimal"
                    placeholder="0.0"
                    className={`${inputClass} pr-14`}
                    {...register("autoThreshold")}
                  />
                  <AmountSuffix isBread={isBread} symbol={symbol} />
                </div>
              </Field>
              <Field
                id={id("small-limit")}
                label="Instant withdrawals per epoch"
                help="How many instant (small) withdrawals each member may make per epoch."
                error={errors.smallWithdrawsLimit?.message}
              >
                <input
                  {...fieldAria(
                    id("small-limit"),
                    errors.smallWithdrawsLimit?.message,
                    "help",
                  )}
                  type="number"
                  min={1}
                  className={inputClass}
                  {...register("smallWithdrawsLimit", { valueAsNumber: true })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                id={id("contest-threshold")}
                label="Contest threshold (%)"
                help="A large withdrawal is vetoed when MORE than this percentage of members contest it."
                error={errors.contestThreshold?.message}
              >
                <input
                  {...fieldAria(
                    id("contest-threshold"),
                    errors.contestThreshold?.message,
                    "help",
                  )}
                  type="number"
                  min={1}
                  max={100}
                  className={inputClass}
                  {...register("contestThreshold", { valueAsNumber: true })}
                />
              </Field>
              <Field
                id={id("contest-window")}
                label="Contest window (days)"
                help="How long the group has to contest a large withdrawal before it becomes executable."
                error={errors.contestWindowDays?.message}
              >
                <input
                  {...fieldAria(
                    id("contest-window"),
                    errors.contestWindowDays?.message,
                    "help",
                  )}
                  type="number"
                  min={0}
                  step="any"
                  className={inputClass}
                  {...register("contestWindowDays", { valueAsNumber: true })}
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      {/* Mobile-only: advance to the Overview/Create step. */}
      <Button
        app="net"
        variant="secondary"
        type="button"
        className="w-full lg:hidden"
        rightIcon={<ArrowRight />}
        onClick={continueToReview}
      >
        Continue
      </Button>
    </Card>
  );
}

/** Right panel: a live plain-language summary + the primary Create action. */
function OverviewPanel({ onBack }: { onBack: () => void }) {
  const { address } = useAccount();
  const form = useFormContext<CreateNetValues>();
  const {
    watch,
    handleSubmit,
    formState: { errors },
  } = form;
  const {
    create,
    status,
    hash,
    receipt,
    error: txError,
    isBusy,
  } = useCreateSafetyNet();

  const token = useNetToken(form);
  const { decimals } = useTokenInfo(token);
  const symbol = useNetSymbol(form);

  const members = watch("memberCount");
  const initial = watch("initialDeposit");
  const fixed = watch("fixedDeposit");
  const epochDays = watch("epochDurationDays");
  const autoThreshold = watch("autoThreshold");

  const amt = (v: string) => (v && Number(v) > 0 ? `${v} ${symbol}` : "—");

  // The new net's id, decoded from the SafetyNetCreated event in the receipt,
  // so success can link straight to the net page.
  const createdId = useMemo(() => {
    if (!receipt) return undefined;
    try {
      const logs = parseEventLogs({
        abi: safetyNetAbi,
        logs: receipt.logs,
        eventName: "SafetyNetCreated",
      });
      return logs[0]?.args.id;
    } catch {
      return undefined;
    }
  }, [receipt]);

  const onSubmit = handleSubmit((v) => {
    if (!address || !token) return;
    const initialDeposit = parseAmount(v.initialDeposit, decimals);
    const fixedDeposit = parseAmount(v.fixedDeposit, decimals);
    const autoThresholdWei = parseAmount(v.autoThreshold, decimals);
    if (
      initialDeposit === null ||
      fixedDeposit === null ||
      autoThresholdWei === null
    )
      return;

    create({
      id: 0n, // assigned by the contract
      owner: address,
      minimumMembers: BigInt(v.minimumMembers),
      maximumMembers: BigInt(v.memberCount),
      contestThreshold: BigInt(v.contestThreshold),
      // The contract requires an empty member list and a zero start time:
      // the owner becomes the sole member, everyone else joins by invite,
      // and the clock only starts when the owner calls start().
      safetyNetStart: 0n,
      token,
      members: [],
      initialDeposit,
      fixedDeposit,
      redeemRatio: BigInt(REDEEM_RATIO), // locked to 1 onchain in v1
      autoThreshold: autoThresholdWei,
      contestWindow: BigInt(Math.round(v.contestWindowDays * 86_400)),
      epochDuration: BigInt(Math.round(v.epochDurationDays * 86_400)),
      smallWithdrawsLimit: BigInt(v.smallWithdrawsLimit),
    });
  });

  const created = status === "success";

  return (
    <Card className="border-primary-jade/30 flex flex-col gap-5">
      <Heading4 className="text-text-standard border-paper-2 border-b pb-3">
        Overview
      </Heading4>

      <Body className="text-surface-grey-2 leading-relaxed">
        A {symbol} saving circle of up to{" "}
        <strong className="text-text-standard">{members || "—"}</strong> members.
        Everyone pays{" "}
        <strong className="text-text-standard">{amt(initial)}</strong> to join and{" "}
        <strong className="text-text-standard">{amt(fixed)}</strong> each epoch
        (~<strong className="text-text-standard">{epochDays || "—"}</strong> days).
        Withdrawals over{" "}
        <strong className="text-text-standard">{amt(autoThreshold)}</strong> go to
        a group vote.
      </Body>

      <p className="text-surface-grey text-xs">
        Deposits and withdrawal power are 1:1 (redeem ratio ×1) — every token you
        put in unlocks exactly one token of withdrawable balance.
      </p>

      {Object.keys(errors).length > 0 && !created && (
        <p className="text-system-red text-xs font-medium">
          Some fields need attention — check the form.
        </p>
      )}

      <div className="mt-1">
        {created ? (
          <div
            role="status"
            aria-live="polite"
            className="border-primary-jade/40 bg-primary-jade/5 rounded-xl border p-4"
          >
            <Heading4 className="text-text-standard flex items-center gap-2">
              <CheckCircle
                size={22}
                weight="fill"
                className="text-system-green shrink-0"
              />
              Safety Net{" "}
              {createdId !== undefined ? `#${createdId.toString()} ` : ""}
              created
            </Heading4>
            <Body className="text-surface-grey-2 mt-1 text-sm">
              {createdId !== undefined
                ? "You're the first member. Share the single-use invite links below — everyone else joins through them, and you start the net from its page once enough have joined."
                : "Next step: open your new net, share its invite links, and start it once enough members have joined."}
            </Body>
            {createdId !== undefined && <SuccessInvites id={createdId} />}
            <div className="mt-3">
              <Button
                as={Link}
                app="net"
                variant="primary"
                rightIcon={<ArrowRight />}
                href={createdId !== undefined ? `/net/?id=${createdId}` : "/"}
              >
                {createdId !== undefined
                  ? `Open Safety Net #${createdId.toString()}`
                  : "Go to your dashboard"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ActionButton onClick={onSubmit} isLoading={isBusy}>
              Create Safety Net
            </ActionButton>
            <TxStatus status={status} hash={hash} error={txError} />
          </>
        )}
      </div>

      {!created && (
        <Button
          app="net"
          variant="secondary"
          type="button"
          className="w-full lg:hidden"
          leftIcon={<ArrowLeft />}
          onClick={onBack}
        >
          Back
        </Button>
      )}
    </Card>
  );
}

/** The selected token address (or undefined for an incomplete custom entry). */
function useNetToken(form: NetForm): Address | undefined {
  const tokenChoice = form.watch("tokenChoice");
  const customToken = form.watch("customToken");
  return useMemo(() => {
    if (tokenChoice === "bread") return BREAD_ADDRESS;
    return isAddress(customToken) ? customToken : undefined;
  }, [tokenChoice, customToken]);
}

/** Display symbol for the selected token ("BREAD" or the ERC20 symbol). */
function useNetSymbol(form: NetForm): string {
  const token = useNetToken(form);
  const { symbol } = useTokenInfo(token);
  return form.watch("tokenChoice") === "bread" ? "BREAD" : symbol;
}

/** Protocol-allowance warning for the selected token. */
function TokenAllowedWarning({ form }: { form: NetForm }) {
  const token = useNetToken(form);
  const { data: tokenAllowed } = useIsTokenAllowed(token);
  if (!token || tokenAllowed !== false) return null;
  return (
    <p className="text-system-warning mt-1.5 text-xs font-medium">
      This token is not currently allowed by the SafetyNet protocol — creation
      will fail until the protocol owner allows it.
    </p>
  );
}
