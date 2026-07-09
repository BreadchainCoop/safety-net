"use client";

import { useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Caption, LoadingIcon } from "@breadcoop/ui";
import { FirstAidKit, UploadSimple } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { NoteBox } from "@/components/ui/note-box";
import { TxStatus } from "@/components/ui/tx-status";
import { Badge, Card } from "@/components/ui/ui";
import { RegisterEmailPanel } from "@/components/net/register-email-panel";
import { useClaimFlu } from "@/hooks/use-safety-net-writes";
import { useEmailCommitment, useFluClaimCooldown } from "@/hooks/use-flu-claim";
import { useTokenInfo } from "@/hooks/use-token";
import { BASE_PATH, DAYS_IN_A_MONTH, FLU_ARTIFACTS } from "@/lib/config";
import { formatAmount, formatDuration } from "@/lib/format";
import {
  checkProofBundle,
  encodeFluClaimProof,
  parseProofBundle,
  type FluProofBundle,
} from "@/lib/flu-claim";
import type { SafetyNetDetails } from "@/lib/types";

// Mirror the on-chain flu payout: FLU_PAYOUT_DAYS at the daily rate, ratio
// capped at FLU_MAX_SUPPORT_RATIO (see SafetyNet.claimFlu).
const FLU_PAYOUT_DAYS = 7n;
const FLU_MAX_SUPPORT_RATIO = 12n;

type Phase = "idle" | "proving" | "ready";

/**
 * Instant flu-claim settlement against a ZK Email proof — no contest phase.
 * The member proves a DKIM-signed email from an allowlisted healthcare sender
 * matched the flu-diagnosis pattern, and the pool pays a fixed 7-day payout.
 *
 * Proving is heavy (GB-scale artifacts), so the panel supports two paths:
 * generate the proof in-browser (when circuit artifacts are configured), or
 * upload a proof bundle produced by the CLI prover. The email body and
 * diagnosis never touch the chain — only the proof and its public signals do.
 */
export function ClaimFluPanel({ details }: { details: SafetyNetDetails }) {
  const net = details.safetyNet;
  const { address } = useAccount();
  const { symbol, decimals } = useTokenInfo(net.token);
  const { claimFlu, status, hash, error, isBusy } = useClaimFlu();
  const { verifier, commitment, isReady, isRegistered } = useEmailCommitment();
  const { isCoolingDown, nextClaimAt } = useFluClaimCooldown(net.id);

  const [bundle, setBundle] = useState<FluProofBundle | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<string>("");
  const emlInputRef = useRef<HTMLInputElement>(null);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const effectiveRatio = details.effectiveRedeemRatio;
  const cappedRatio =
    effectiveRatio < FLU_MAX_SUPPORT_RATIO ? effectiveRatio : FLU_MAX_SUPPORT_RATIO;
  const dailyAmount = (details.monthlyContribute * cappedRatio) / DAYS_IN_A_MONTH;
  const payout = dailyAmount * FLU_PAYOUT_DAYS;

  // Preconditions that mirror SafetyNet.claimFlu's on-chain guards, so members
  // see a clear reason instead of a reverted transaction.
  const notOnboarded = details.monthlyContribute === 0n;
  const inFirstEpoch = details.currentEpochIndex === 0n;
  const decommissionable = details.isDecommissionable;
  const insufficientBalance = payout > details.withdrawableBalance;
  const canProveInBrowser = Boolean(FLU_ARTIFACTS.wasmUrl && FLU_ARTIFACTS.zkeyUrl);

  const bundleError = useMemo(() => {
    if (!bundle || !address) return null;
    return checkProofBundle(bundle, address, commitment);
  }, [bundle, address, commitment]);

  const acceptBundle = (parsed: FluProofBundle) => {
    setBundle(parsed);
    setPhase("ready");
  };

  const onUploadBundle = async (file: File) => {
    setLocalError(null);
    try {
      acceptBundle(parseProofBundle(await file.text()));
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not read the proof bundle.");
    }
  };

  const onProveEml = async (file: File) => {
    if (!address) return;
    setLocalError(null);
    setPhase("proving");
    setProgress("Reading the email…");
    try {
      const { proveInBrowser } = await import("@/lib/flu-claim-prover");
      const proved = await proveInBrowser(
        await file.text(),
        address,
        { wasmUrl: FLU_ARTIFACTS.wasmUrl as string, zkeyUrl: FLU_ARTIFACTS.zkeyUrl as string },
        setProgress,
        BASE_PATH,
      );
      acceptBundle(proved);
    } catch (e) {
      setPhase("idle");
      setLocalError(
        e instanceof Error ? `Proof generation failed: ${e.message}` : "Proof generation failed.",
      );
    }
  };

  const submit = () => {
    if (!bundle) return;
    claimFlu(net.id, encodeFluClaimProof(bundle));
  };

  const resetProof = () => {
    setBundle(null);
    setPhase("idle");
    setLocalError(null);
  };

  // Flu claims are disabled until a verifier is wired on-chain — hide the panel.
  if (!verifier) return null;

  // Members register their email commitment before they can claim.
  if (!isRegistered || !isReady) {
    return <RegisterEmailPanel verifier={verifier} />;
  }

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <FirstAidKit size={18} weight="duotone" className="text-primary-jade" />
        <Caption className="text-surface-grey-2">Claim flu support</Caption>
      </div>
      <Badge tone="jade">Instant · no vote</Badge>
    </div>
  );

  // Blocking preconditions get a focused card with a single clear reason.
  const blocker = notOnboarded
    ? "Make your first deposit before claiming flu support."
    : inFirstEpoch
      ? "Flu claims open after this Safety Net's first epoch — a short waiting period after it starts."
      : decommissionable
        ? "This Safety Net has an unpaid epoch and can be wound down, so claims are paused until dues are caught up."
        : null;

  if (blocker) {
    return (
      <Card>
        {header}
        <div className="mt-4">
          <NoteBox tone="warning" icon>
            {blocker}
          </NoteBox>
        </div>
      </Card>
    );
  }

  if (isCoolingDown && nextClaimAt !== undefined) {
    const secondsLeft = Number(nextClaimAt) - Math.floor(Date.now() / 1000);
    return (
      <Card>
        {header}
        <div className="mt-4">
          <NoteBox icon>
            You&apos;ve already settled a flu claim recently. Your next claim on this
            Safety Net is available in {formatDuration(BigInt(Math.max(secondsLeft, 0)))}.
          </NoteBox>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {header}

      <div className="mt-4 flex flex-col gap-3">
        <NoteBox icon>
          Prove a diagnosis email from an approved healthcare sender and receive{" "}
          {FLU_PAYOUT_DAYS.toString()} days of support immediately — no contest period. Your
          email stays private; only the zero-knowledge proof is sent on-chain.
        </NoteBox>

        <div className="border-paper-2 flex items-center justify-between rounded-xl border px-4 py-3">
          <Caption className="text-surface-grey-2">Payout</Caption>
          <span className="font-breadDisplay text-text-standard text-lg font-bold">
            {formatAmount(payout, decimals)} {symbol}
          </span>
        </div>

        {phase !== "ready" ? (
          <div className="flex flex-col gap-3">
            {canProveInBrowser && (
              <>
                <input
                  ref={emlInputRef}
                  type="file"
                  accept=".eml,message/rfc822"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onProveEml(f);
                    e.target.value = "";
                  }}
                />
                <ActionButton
                  onClick={() => emlInputRef.current?.click()}
                  isLoading={phase === "proving"}
                  disabled={phase === "proving"}
                >
                  <span className="inline-flex items-center gap-2">
                    <UploadSimple size={18} /> Upload diagnosis email (.eml)
                  </span>
                </ActionButton>
                <Caption className="text-surface-grey-2 text-center">
                  Proving runs entirely in your browser and downloads large artifacts — use a
                  desktop on a good connection.
                </Caption>
              </>
            )}

            <input
              ref={bundleInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadBundle(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => bundleInputRef.current?.click()}
              className="text-primary-jade self-center text-xs font-bold hover:underline"
            >
              {canProveInBrowser
                ? "Or upload a proof bundle from the CLI prover"
                : "Upload a proof bundle (.json) from the CLI prover"}
            </button>

            {phase === "proving" && progress && (
              <div className="text-surface-grey-2 flex items-center gap-2 text-xs font-medium">
                <LoadingIcon app="net" className="w-4 shrink-0" />
                {progress}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <NoteBox tone="jade">
              <strong className="text-text-standard">Proof ready.</strong> Verified email from{" "}
              <span className="font-mono break-all">{bundle?.domain}</span>.
            </NoteBox>

            {bundleError && <p className="text-system-red text-xs font-medium">{bundleError}</p>}
            {insufficientBalance && (
              <p className="text-system-red text-xs font-medium">
                Your withdrawable balance is below the {FLU_PAYOUT_DAYS.toString()}-day payout
                right now.
              </p>
            )}

            <ActionButton
              onClick={submit}
              isLoading={isBusy}
              disabled={Boolean(bundleError) || insufficientBalance}
            >
              Settle flu claim
            </ActionButton>
            <button
              type="button"
              onClick={resetProof}
              className="text-surface-grey-2 self-center text-xs font-medium hover:underline"
            >
              Use a different proof
            </button>
          </div>
        )}

        {localError && <p className="text-system-red text-xs font-medium">{localError}</p>}
        <TxStatus status={status} hash={hash} error={error} successLabel="Flu claim settled" />
      </div>
    </Card>
  );
}
