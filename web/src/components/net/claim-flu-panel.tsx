"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Caption, LoadingIcon } from "@breadcoop/ui";
import {
  CheckCircle,
  EnvelopeSimpleOpen,
  FirstAidKit,
  PaperPlaneTilt,
  UploadSimple,
} from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { NoteBox } from "@/components/ui/note-box";
import { TxStatus } from "@/components/ui/tx-status";
import { Badge, Card } from "@/components/ui/ui";
import { useClaimFlu } from "@/hooks/use-safety-net-writes";
import { useFluClaimVerifierAddress, useFluClaimCooldown } from "@/hooks/use-flu-claim";
import { useTokenInfo } from "@/hooks/use-token";
import { DAYS_IN_A_MONTH, FLU_ARTIFACTS } from "@/lib/config";
import { formatAmount, formatDuration } from "@/lib/format";
import {
  bindingEmailSubject,
  checkProofBundle,
  emailProviderDomain,
  encodeFluClaimProof,
  extractEmailAddress,
  parseProofBundle,
  type FluProofBundle,
} from "@/lib/flu-claim";
import type { SafetyNetDetails } from "@/lib/types";

// Mirror the on-chain flu payout: FLU_PAYOUT_DAYS at the daily rate, ratio capped at
// FLU_MAX_SUPPORT_RATIO (see SafetyNet.claimFlu).
const FLU_PAYOUT_DAYS = 7n;
const FLU_MAX_SUPPORT_RATIO = 12n;

type Step = "diagnosis" | "send-binding" | "upload-binding" | "ready";

// Provider-specific "how to export the sent email" tips, keyed by email domain.
const EXPORT_TIPS: Record<string, string> = {
  "gmail.com": "In Gmail, open the message in your Sent folder, click the ⋮ menu (top-right of the message) → Download message.",
  "googlemail.com": "In Gmail, open the message in Sent, click the ⋮ menu → Download message.",
  "outlook.com": "In Outlook, open the sent message → ··· (More actions) → Save as → it downloads a .eml file.",
  "hotmail.com": "In Outlook, open the sent message → ··· (More actions) → Save as.",
  "live.com": "In Outlook, open the sent message → ··· (More actions) → Save as.",
  "yahoo.com": "In Yahoo Mail, open the sent message → ··· (More) → Download message.",
  "icloud.com": "In the Mail app, select the sent message → File → Save As → Raw Message Source (.eml).",
};

const stepClass = (active: boolean, done: boolean) =>
  done ? "bg-primary-jade text-paper-0" : active ? "bg-primary-jade text-paper-0" : "bg-paper-2 text-surface-grey-2";

/**
 * Guided flu-claim wizard (design C — two-email in-circuit binding, no registration). The member:
 *   1. uploads their DKIM-signed diagnosis email,
 *   2. sends themselves a one-line email whose subject is their wallet address (their provider
 *      DKIM-signs it, proving they control the inbox — nobody else can),
 *   3. uploads that email,
 * then the proof is generated (in-browser or via the CLI bundle) and the claim settles instantly.
 * Their email address never leaves the browser and never goes on-chain.
 */
export function ClaimFluPanel({ details }: { details: SafetyNetDetails }) {
  const net = details.safetyNet;
  const { address } = useAccount();
  const { symbol, decimals } = useTokenInfo(net.token);
  const { claimFlu, status, hash, error, isBusy } = useClaimFlu();
  const verifier = useFluClaimVerifierAddress();
  const { isCoolingDown, nextClaimAt } = useFluClaimCooldown(net.id);

  const [step, setStep] = useState<Step>("diagnosis");
  const [diagnosisText, setDiagnosisText] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState<string | null>(null);
  const [bundle, setBundle] = useState<FluProofBundle | null>(null);
  const [proving, setProving] = useState(false);
  const [progress, setProgress] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const diagInputRef = useRef<HTMLInputElement>(null);
  const bindInputRef = useRef<HTMLInputElement>(null);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const effectiveRatio = details.effectiveRedeemRatio;
  const cappedRatio = effectiveRatio < FLU_MAX_SUPPORT_RATIO ? effectiveRatio : FLU_MAX_SUPPORT_RATIO;
  const payout = ((details.monthlyContribute * cappedRatio) / DAYS_IN_A_MONTH) * FLU_PAYOUT_DAYS;

  const notOnboarded = details.monthlyContribute === 0n;
  const inFirstEpoch = details.currentEpochIndex === 0n;
  const decommissionable = details.isDecommissionable;
  const insufficientBalance = payout > details.withdrawableBalance;
  const canProveInBrowser = Boolean(FLU_ARTIFACTS.wasmUrl && FLU_ARTIFACTS.zkeyUrl);

  const bundleError = useMemo(
    () => (bundle && address ? checkProofBundle(bundle, address) : null),
    [bundle, address],
  );

  const walletSubject = address ? bindingEmailSubject(address) : "";
  const providerDomain = memberEmail ? emailProviderDomain(memberEmail) : undefined;
  const exportTip = providerDomain ? EXPORT_TIPS[providerDomain] : undefined;
  const mailto = memberEmail
    ? `mailto:${memberEmail}?subject=${encodeURIComponent(walletSubject)}&body=${encodeURIComponent(
        "Sending this proves you control this inbox for your Safety Net flu claim. Just hit send, then save this message as a .eml file and upload it. (The subject is your wallet address — leave it exactly as is.)",
      )}`
    : undefined;

  const reset = () => {
    setStep("diagnosis");
    setDiagnosisText(null);
    setMemberEmail(null);
    setBundle(null);
    setLocalError(null);
    setProgress("");
  };

  const onDiagnosis = async (file: File) => {
    setLocalError(null);
    const text = await file.text();
    const to = extractEmailAddress(text, "to");
    if (!to) {
      setLocalError("Couldn't read a recipient (To:) address from that email. Is it a raw .eml file?");
      return;
    }
    setDiagnosisText(text);
    setMemberEmail(to);
    setStep("send-binding");
  };

  const onBinding = async (file: File) => {
    setLocalError(null);
    const text = await file.text();
    const from = extractEmailAddress(text, "from");
    if (!from) {
      setLocalError("Couldn't read a sender (From:) address from that email. Is it a raw .eml file?");
      return;
    }
    if (memberEmail && from !== memberEmail) {
      setLocalError(
        `That email was sent from ${from}, but it must be sent from ${memberEmail} — the same inbox your diagnosis was sent to.`,
      );
      return;
    }
    await prove(diagnosisText as string, text);
  };

  const prove = async (diagnosis: string, binding: string) => {
    if (!address) return;
    if (!canProveInBrowser) {
      setStep("upload-binding");
      setLocalError(
        "In-browser proving isn't configured on this deployment. Generate the proof with the CLI prover (both .eml files) and upload the bundle below.",
      );
      return;
    }
    setProving(true);
    setProgress("Reading your emails…");
    try {
      const { proveInBrowser } = await import("@/lib/flu-claim-prover");
      const proved = await proveInBrowser(
        diagnosis,
        binding,
        address,
        { wasmUrl: FLU_ARTIFACTS.wasmUrl as string, zkeyUrl: FLU_ARTIFACTS.zkeyUrl as string },
        setProgress,
      );
      setBundle(proved);
      setStep("ready");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Proof generation failed.");
    } finally {
      setProving(false);
    }
  };

  const onBundle = async (file: File) => {
    setLocalError(null);
    try {
      setBundle(parseProofBundle(await file.text()));
      setStep("ready");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not read the proof bundle.");
    }
  };

  const settle = () => {
    if (bundle) claimFlu(net.id, encodeFluClaimProof(bundle));
  };

  // Flu claims are disabled until a verifier is wired on-chain — hide the panel.
  if (!verifier) return null;

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <FirstAidKit size={18} weight="duotone" className="text-primary-jade" />
        <Caption className="text-surface-grey-2">Claim flu support</Caption>
      </div>
      <Badge tone="jade">Instant · no vote</Badge>
    </div>
  );

  // Blocking preconditions mirror SafetyNet.claimFlu's on-chain guards.
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
            You&apos;ve already settled a flu claim recently. Your next claim on this Safety Net is
            available in {formatDuration(BigInt(Math.max(secondsLeft, 0)))}.
          </NoteBox>
        </div>
      </Card>
    );
  }

  const stepNo = step === "diagnosis" ? 1 : step === "ready" ? 3 : 2;

  return (
    <Card>
      {header}

      <div className="mt-4 flex flex-col gap-4">
        <NoteBox icon>
          Prove a diagnosis email from an approved healthcare sender and receive{" "}
          {FLU_PAYOUT_DAYS.toString()} days of support immediately — no contest period. Your email
          address never leaves your browser or touches the chain.{" "}
          <Link href="/how/flu" className="text-primary-jade font-bold hover:underline">
            How flu claims work →
          </Link>
        </NoteBox>

        <div className="border-paper-2 flex items-center justify-between rounded-xl border px-4 py-3">
          <Caption className="text-surface-grey-2">Payout</Caption>
          <span className="font-breadDisplay text-text-standard text-lg font-bold">
            {formatAmount(payout, decimals)} {symbol}
          </span>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {[
            [1, "Diagnosis"],
            [2, "Prove it's yours"],
            [3, "Settle"],
          ].map(([n, label], i) => {
            const num = n as number;
            return (
              <div key={num} className="flex flex-1 items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${stepClass(
                    stepNo === num,
                    stepNo > num,
                  )}`}
                >
                  {stepNo > num ? <CheckCircle size={14} weight="fill" /> : num}
                </span>
                <span className="text-surface-grey-2 hidden text-xs font-medium sm:block">{label}</span>
                {i < 2 && <span className="bg-paper-2 h-px flex-1" />}
              </div>
            );
          })}
        </div>

        {/* Step 1: diagnosis email */}
        {step === "diagnosis" && (
          <div className="flex flex-col gap-3">
            <Caption className="text-surface-grey-2">
              Upload the diagnosis email your healthcare provider sent you (a .eml file — result,
              prescription, or a note naming influenza / an ICD-10 flu code).
            </Caption>
            <input
              ref={diagInputRef}
              type="file"
              accept=".eml,message/rfc822"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onDiagnosis(f);
                e.target.value = "";
              }}
            />
            <ActionButton onClick={() => diagInputRef.current?.click()}>
              <span className="inline-flex items-center gap-2">
                <UploadSimple size={18} /> Upload diagnosis email (.eml)
              </span>
            </ActionButton>
          </div>
        )}

        {/* Step 2a: send the binding email */}
        {step === "send-binding" && (
          <div className="flex flex-col gap-3">
            <div className="border-primary-jade/30 bg-primary-jade/5 flex items-center gap-2 rounded-xl border px-4 py-2.5">
              <CheckCircle size={18} weight="fill" className="text-primary-jade shrink-0" />
              <span className="text-surface-grey-2 text-sm">
                Diagnosis email loaded — sent to <span className="font-mono">{memberEmail}</span>
              </span>
            </div>
            <NoteBox icon>
              <strong className="text-text-standard">Now prove that inbox is yours.</strong> Send
              yourself a one-line email with your wallet address as the subject. Your email provider
              signs it on the way out, which cryptographically proves you control{" "}
              <span className="font-mono">{memberEmail}</span> — and only you can do that.
            </NoteBox>
            <div className="border-paper-2 rounded-xl border px-4 py-3">
              <Caption className="text-surface-grey-2">Subject must be exactly</Caption>
              <p className="text-text-standard mt-1 font-mono text-sm break-all">{walletSubject}</p>
            </div>
            <ActionButton onClick={() => mailto && window.open(mailto, "_blank")}>
              <span className="inline-flex items-center gap-2">
                <PaperPlaneTilt size={18} /> Open my email app (pre-filled)
              </span>
            </ActionButton>
            <NoteBox tone="warning">
              Send it from <span className="font-mono">{memberEmail}</span> (the same inbox), then save
              the sent message as a .eml file.{" "}
              {exportTip ?? "In most webmail: open the sent message → More (⋯) → Download / Save as."}
            </NoteBox>
            <button
              type="button"
              onClick={() => setStep("upload-binding")}
              className="bg-primary-jade hover:bg-primary-jade/90 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-colors"
            >
              I&apos;ve sent it — upload it
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-surface-grey-2 self-center text-xs font-medium hover:underline"
            >
              Start over
            </button>
          </div>
        )}

        {/* Step 2b: upload the binding email */}
        {step === "upload-binding" && (
          <div className="flex flex-col gap-3">
            <Caption className="text-surface-grey-2">
              Upload the email you just sent to yourself (its subject is your wallet address).
            </Caption>
            <input
              ref={bindInputRef}
              type="file"
              accept=".eml,message/rfc822"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onBinding(f);
                e.target.value = "";
              }}
            />
            <ActionButton
              onClick={() => bindInputRef.current?.click()}
              isLoading={proving}
              disabled={proving}
            >
              <span className="inline-flex items-center gap-2">
                <EnvelopeSimpleOpen size={18} /> Upload inbox-control email (.eml)
              </span>
            </ActionButton>
            {proving && progress && (
              <div className="text-surface-grey-2 flex items-center gap-2 text-xs font-medium">
                <LoadingIcon app="net" className="w-4 shrink-0" /> {progress}
              </div>
            )}
            <button
              type="button"
              onClick={() => setStep("send-binding")}
              className="text-surface-grey-2 self-center text-xs font-medium hover:underline"
            >
              ← Back
            </button>
          </div>
        )}

        {/* Step 3: settle */}
        {step === "ready" && (
          <div className="flex flex-col gap-3">
            <NoteBox tone="jade">
              <strong className="text-text-standard">Proof ready.</strong> Verified diagnosis from{" "}
              <span className="font-mono break-all">{bundle?.providerDomain}</span>, inbox control
              signed by <span className="font-mono break-all">{bundle?.bindingDomain}</span>.
            </NoteBox>
            {bundleError && <p className="text-system-red text-xs font-medium">{bundleError}</p>}
            {insufficientBalance && (
              <p className="text-system-red text-xs font-medium">
                Your withdrawable balance is below the {FLU_PAYOUT_DAYS.toString()}-day payout right now.
              </p>
            )}
            <ActionButton
              onClick={settle}
              isLoading={isBusy}
              disabled={Boolean(bundleError) || insufficientBalance}
            >
              Settle flu claim
            </ActionButton>
            <button
              type="button"
              onClick={reset}
              className="text-surface-grey-2 self-center text-xs font-medium hover:underline"
            >
              Start over
            </button>
          </div>
        )}

        {/* CLI bundle escape hatch */}
        {step !== "ready" && (
          <>
            <input
              ref={bundleInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onBundle(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => bundleInputRef.current?.click()}
              className="text-primary-jade self-center text-xs font-bold hover:underline"
            >
              Already have a proof bundle from the CLI prover? Upload it
            </button>
          </>
        )}

        {localError && <p className="text-system-red text-xs font-medium">{localError}</p>}
        <TxStatus status={status} hash={hash} error={error} successLabel="Flu claim settled" />
      </div>
    </Card>
  );
}
