"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
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
import { ArrowLeft, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { TxStatus } from "@/components/ui/tx-status";
import { Card } from "@/components/ui/ui";
import { Slider } from "@/components/ui/slider-field";
import { useCreateSafetyNet } from "@/hooks/use-safety-net-writes";
import { useIsTokenAllowed } from "@/hooks/use-safety-net";
import { useTokenInfo } from "@/hooks/use-token";
import { safetyNetAbi } from "@/lib/abi/safety-net";
import {
  BREAD_ADDRESS,
  BROODFONDS_RATIO,
  groupRatioCap,
  MAX_REDEEM_RATIO,
  MIN_REDEEM_RATIO,
} from "@/lib/config";
import { parseAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createNetSchema, type CreateNetValues } from "./schema";
import { SuccessInvites } from "./success-invites";

const inputClass =
  "w-full rounded-xl border border-paper-2 bg-paper-main px-4 py-2.5 text-text-standard outline-none focus:border-primary-jade disabled:opacity-60";

/**
 * Defaults modelled on the Dutch Broodfonds ("bread fund"): a small mutual-aid
 * circle where members pay a fixed monthly contribution, the group is capped at
 * ~50 people, and larger claims are reviewed by the members. Simple mode uses
 * these verbatim so a creator only picks a name, a monthly amount, and a size.
 *
 * Derived amounts (not in this table, computed from the recurring deposit):
 *  - initialDeposit  = one recurring deposit (the one-off join payment)
 *  - autoThreshold   = ¼ of the recurring deposit (small top-ups pay out
 *    instantly; anything bigger — an actual claim — goes to group review)
 */
const DEFAULTS = {
  /** Suggested monthly contribution (BREAD ≈ USD; Broodfonds range ≈ 34–112). */
  monthlyContribution: "50",
  /** Broodfonds caps groups at 50 to keep everyone accountable to each other. */
  memberCount: 50,
  /** Broodfonds recommends starting around 25 members — the 22x support math
   *  needs that critical mass. Advanced mode can lower it to the contract
   *  minimum of 2 (for small trusted circles or testing). */
  minimumMembers: 25,
  /** Monthly dues. */
  epochDurationDays: 30,
  /** A claim is blocked only if a majority of members object. */
  contestThreshold: 50,
  /** A week for the group to review a large withdrawal. */
  contestWindowDays: 7,
  /** Small instant top-ups a member may take per month. */
  smallWithdrawsLimit: 5,
} as const;

/** One-off join payment defaults to a single monthly contribution. */
function deriveInitial(fixed: string): string {
  const n = Number(fixed);
  return Number.isFinite(n) && n > 0 ? fixed.trim() : "";
}

/** Instant-withdrawal threshold defaults to a quarter of the monthly amount. */
function deriveAuto(fixed: string): string {
  const n = Number(fixed);
  return Number.isFinite(n) && n > 0 ? String(n / 4) : "";
}

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
      name: "",
      memberCount: DEFAULTS.memberCount,
      tokenChoice: "bread",
      customToken: "",
      // Simple mode only asks for the monthly amount; it's pre-filled with the
      // Broodfonds-ish default so a net is creatable with just a name.
      fixedDeposit: DEFAULTS.monthlyContribution,
      // Derived from the monthly amount unless overridden in Advanced.
      initialDeposit: "",
      redeemRatio: BROODFONDS_RATIO,
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
            A mutual-aid savings circle in the spirit of the Dutch Broodfonds:
            everyone chips in monthly, and the group reviews larger claims.
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

type Mode = "simple" | "advanced";

/** Left panel: Simple (Broodfonds defaults) or Advanced (full control). */
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
  const [mode, setMode] = useState<Mode>("simple");

  const tokenChoice = watch("tokenChoice");
  const isBread = tokenChoice === "bread";
  const symbol = useNetSymbol(form);
  const fixed = watch("fixedDeposit");
  const memberCount = watch("memberCount");
  const ratio = watch("redeemRatio");

  // Simple mode manages minimumMembers for the user: the Broodfonds 25, but
  // never above the chosen group size (the schema cross-checks the two, and a
  // hidden failing field would block creation invisibly).
  useEffect(() => {
    if (mode !== "simple") return;
    const cap = Number.isFinite(memberCount) ? memberCount : DEFAULTS.minimumMembers;
    setValue("minimumMembers", Math.max(2, Math.min(DEFAULTS.minimumMembers, cap)));
  }, [mode, memberCount, setValue]);

  const continueToReview = async () => {
    if (await trigger()) onContinue();
  };

  // When entering Advanced, surface the currently-derived amounts so the fields
  // aren't blank; when returning to Simple, clear any overrides so the derived
  // Broodfonds defaults apply again on submit.
  const switchMode = (next: Mode) => {
    if (next === "advanced") {
      const fixed = getValues("fixedDeposit");
      if (!getValues("initialDeposit")) setValue("initialDeposit", deriveInitial(fixed));
      if (!getValues("autoThreshold")) setValue("autoThreshold", deriveAuto(fixed));
    } else {
      setValue("initialDeposit", "");
      setValue("autoThreshold", "");
    }
    setMode(next);
  };

  return (
    <Card className="flex flex-col gap-5">
      {/* Mode toggle */}
      <div
        role="tablist"
        aria-label="Setup mode"
        className="border-paper-2 bg-paper-1 flex gap-1 self-start rounded-xl border p-1"
      >
        {(
          [
            ["simple", "Simple"],
            ["advanced", "Advanced"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-bold transition-colors",
              mode === value
                ? "bg-primary-jade text-white"
                : "text-surface-grey-2 hover:text-primary-jade",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "simple" && (
        <p className="border-primary-jade/30 bg-primary-jade/5 text-surface-grey-2 rounded-xl border px-4 py-3 text-xs">
          Using Broodfonds defaults: monthly dues, up to {DEFAULTS.memberCount}{" "}
          members (startable once {DEFAULTS.minimumMembers} have joined), a
          one-month join deposit, and ×{BROODFONDS_RATIO} monthly support when a
          member is in need — larger claims are reviewed by the group over{" "}
          {DEFAULTS.contestWindowDays} days. Switch to <strong>Advanced</strong>{" "}
          to change the support ratio, join deposit, epoch length, petty-cash
          threshold, or review rules.
        </p>
      )}

      <Field
        id={id("name")}
        label="Safety Net name"
        help="A friendly name for your group (optional). Members see this everywhere instead of just an id."
        error={errors.name?.message}
      >
        <input
          {...fieldAria(id("name"), errors.name?.message, "help")}
          type="text"
          maxLength={128}
          placeholder="e.g. Carla's Art Collective"
          className={inputClass}
          {...register("name")}
        />
      </Field>

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
        id={id("fixed-deposit")}
        label="Monthly contribution"
        help={
          isBread
            ? "What each member pays every epoch. 1 BREAD = 1 USD. Broodfonds contributions are typically ~34–112/month."
            : "What each member pays every epoch after joining."
        }
        error={errors.fixedDeposit?.message}
      >
        <div className="relative">
          <input
            {...fieldAria(id("fixed-deposit"), errors.fixedDeposit?.message, "help")}
            inputMode="decimal"
            placeholder="0.0"
            className={`${inputClass} pr-14`}
            {...register("fixedDeposit")}
          />
          <AmountSuffix isBread={isBread} symbol={symbol} />
        </div>
        <Slider
          min={10}
          max={250}
          step={5}
          value={Number(fixed) || 10}
          onChange={(v) =>
            setValue("fixedDeposit", String(v), {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
          ariaLabel="Monthly contribution slider"
          className="mt-3"
        />
        <SupportRateNote
          fixed={fixed}
          ratio={ratio}
          memberCount={memberCount}
          symbol={symbol}
        />
      </Field>

      <Field
        id={id("member-count")}
        label="Group size (max members)"
        help="You'll be the first member. Everyone else joins through invite links before you start the net. Broodfonds caps groups at 50."
        error={errors.memberCount?.message}
      >
        <input
          {...fieldAria(id("member-count"), errors.memberCount?.message, "help")}
          type="number"
          min={2}
          className={inputClass}
          {...register("memberCount", { valueAsNumber: true })}
        />
        <Slider
          min={2}
          max={50}
          step={1}
          value={Number.isFinite(memberCount) ? memberCount : 2}
          onChange={(v) =>
            setValue("memberCount", v, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
          ariaLabel="Group size slider"
          className="mt-3"
        />
      </Field>

      {mode === "advanced" && (
        <div className="border-paper-2 flex flex-col gap-5 border-t pt-5">
          <Heading4 className="text-text-standard text-base">
            Advanced settings
          </Heading4>

          <Field
            id={id("redeem-ratio")}
            label="Support ratio"
            help={`How much monthly support a member in need can draw, as a multiple of the monthly contribution. ×1 is a pure savings circle — you only take out what you put in. Broodfonds groups use ≈×${BROODFONDS_RATIO}. The rate members actually get is throttled onchain to what the group size and pool can sustainably back.`}
            error={errors.redeemRatio?.message}
          >
            <input
              {...fieldAria(id("redeem-ratio"), errors.redeemRatio?.message, "help")}
              type="number"
              min={MIN_REDEEM_RATIO}
              max={MAX_REDEEM_RATIO}
              className={inputClass}
              {...register("redeemRatio", { valueAsNumber: true })}
            />
            <Slider
              min={MIN_REDEEM_RATIO}
              max={MAX_REDEEM_RATIO}
              step={1}
              value={Number.isFinite(ratio) ? ratio : BROODFONDS_RATIO}
              onChange={(v) =>
                setValue("redeemRatio", v, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              ariaLabel="Support ratio slider"
              className="mt-3"
            />
          </Field>

          <Field
            id={id("initial-deposit")}
            label="Initial (join) deposit"
            help={
              isBread
                ? "One-off joining payment; a member's first deposit must be exactly this. Defaults to one monthly contribution."
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
                placeholder={deriveInitial(watch("fixedDeposit")) || "0.0"}
                className={`${inputClass} pr-14`}
                {...register("initialDeposit")}
              />
              <AmountSuffix isBread={isBread} symbol={symbol} />
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Field
              id={id("min-members")}
              label="Minimum members to start"
              help="You can only start the net once this many members have joined. Broodfonds recommends ~25 — the support math needs critical mass; the contract minimum is 2."
              error={errors.minimumMembers?.message}
            >
              <input
                {...fieldAria(id("min-members"), errors.minimumMembers?.message, "help")}
                type="number"
                min={2}
                className={inputClass}
                {...register("minimumMembers", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id={id("auto-threshold")}
              label="Instant (petty-cash) threshold"
              help="Small withdrawals up to this amount pay out instantly with no review — petty cash, not the monthly support cap. Defaults to ¼ of the monthly contribution."
              error={errors.autoThreshold?.message}
            >
              <div className="relative">
                <input
                  {...fieldAria(id("auto-threshold"), errors.autoThreshold?.message, "help")}
                  inputMode="decimal"
                  placeholder={deriveAuto(watch("fixedDeposit")) || "0.0"}
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
                {...fieldAria(id("small-limit"), errors.smallWithdrawsLimit?.message, "help")}
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
                {...fieldAria(id("contest-threshold"), errors.contestThreshold?.message, "help")}
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
                {...fieldAria(id("contest-window"), errors.contestWindowDays?.message, "help")}
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

  const name = watch("name")?.trim();
  const members = watch("memberCount");
  const fixed = watch("fixedDeposit");
  const ratio = watch("redeemRatio");
  const epochDays = watch("epochDurationDays");
  const supportPerMonth =
    Number.isFinite(ratio) && Number(fixed) > 0
      ? Number(fixed) * ratio
      : undefined;
  // Show the derived values (Simple mode leaves these blank in form state).
  const initial = watch("initialDeposit")?.trim() || deriveInitial(fixed);
  const autoThreshold = watch("autoThreshold")?.trim() || deriveAuto(fixed);

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
    // Derive the Broodfonds defaults for anything the user left to Simple mode.
    const fixedStr = v.fixedDeposit.trim();
    const initialStr = v.initialDeposit.trim() || deriveInitial(fixedStr);
    const autoStr = v.autoThreshold.trim() || deriveAuto(fixedStr);
    const initialDeposit = parseAmount(initialStr, decimals);
    const fixedDeposit = parseAmount(fixedStr, decimals);
    const autoThresholdWei = parseAmount(autoStr, decimals);
    if (
      initialDeposit === null ||
      fixedDeposit === null ||
      autoThresholdWei === null
    )
      return;

    create(v.name.trim(), {
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
      redeemRatio: BigInt(v.redeemRatio),
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
        {name ? (
          <>
            <strong className="text-text-standard">{name}</strong> — a {symbol}{" "}
            saving circle of up to{" "}
          </>
        ) : (
          <>A {symbol} saving circle of up to </>
        )}
        <strong className="text-text-standard">{members || "—"}</strong> members.
        Everyone pays{" "}
        <strong className="text-text-standard">{amt(initial)}</strong> to join and{" "}
        <strong className="text-text-standard">{amt(fixed)}</strong> each epoch
        (~<strong className="text-text-standard">{epochDays || "—"}</strong> days).
        Small withdrawals up to{" "}
        <strong className="text-text-standard">{amt(autoThreshold)}</strong> pay
        out instantly; anything larger goes to a group review.
      </Body>

      {ratio > 1 ? (
        <p className="border-primary-jade/30 bg-primary-jade/5 text-surface-grey-2 rounded-xl border px-4 py-3 text-xs">
          <strong className="text-text-standard">
            Support ratio ×{ratio}:
          </strong>{" "}
          a member in need can draw up to {ratio} × their monthly contribution —
          about{" "}
          <strong className="text-text-standard">
            {supportPerMonth ? `${supportPerMonth} ${symbol}/month` : "—"}
          </strong>{" "}
          — from the shared pool, capped by their withdrawable balance and what
          the group size and pool can sustainably back.
        </p>
      ) : (
        <p className="text-surface-grey text-xs">
          Pure savings circle (support ratio ×1) — every token you put in
          unlocks exactly one token of withdrawable balance.
        </p>
      )}

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
              {name ? `${name} ` : "Safety Net "}
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
                  ? `Open ${name || `Safety Net #${createdId.toString()}`}`
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

/**
 * The headline Broodfonds promise, live-updating under the contribution field:
 * what monthly support the chosen contribution buys, and what the group size
 * sustainably backs (mirror of the contract's actuarial group cap).
 */
function SupportRateNote({
  fixed,
  ratio,
  memberCount,
  symbol,
}: {
  fixed: string;
  ratio: number;
  memberCount: number;
  symbol: string;
}) {
  const n = Number(fixed);
  if (!Number.isFinite(ratio) || ratio <= 1 || !Number.isFinite(n) || n <= 0)
    return null;
  const cap = groupRatioCap(Number.isFinite(memberCount) ? memberCount : 2);
  const sustained = Math.min(ratio, cap);
  return (
    <p className="border-primary-jade/30 bg-primary-jade/5 text-surface-grey-2 mt-3 rounded-xl border px-4 py-3 text-xs">
      <strong className="text-text-standard">
        Monthly support when in need: ×{ratio} ≈ {n * ratio} {symbol}/month.
      </strong>{" "}
      {sustained < ratio ? (
        <>
          A group of {memberCount || "—"} sustainably backs about ×{sustained} (
          {n * sustained} {symbol}/month) — support ramps toward the full rate
          as the group and its pool grow.
        </>
      ) : (
        <>This group size fully backs that rate once the pool has built up.</>
      )}
    </p>
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
