"use client";

import { useId, useMemo, useState } from "react";
import { Caption } from "@breadcoop/ui";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { TxStatus } from "@/components/ui/tx-status";
import { Badge, Card } from "@/components/ui/ui";
import { useRegisterEmailCommitment } from "@/hooks/use-safety-net-writes";
import { useEmailCommitment } from "@/hooks/use-flu-claim";
import { computeEmailCommitment } from "@/lib/flu-claim";
import { formatDuration } from "@/lib/format";
import type { Address } from "viem";

const inputClass =
  "w-full rounded-xl border border-paper-2 bg-paper-main px-4 py-2.5 text-text-standard outline-none focus:border-primary-jade";

/**
 * Registers the member's email commitment (Poseidon hash of their address) on
 * the flu verifier. The plaintext address never leaves the browser — only the
 * hash is sent. The commitment must age past the verifier's waiting period
 * before it can back a claim, so members register once, early.
 */
export function RegisterEmailPanel({ verifier }: { verifier: Address }) {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const { registerEmailCommitment, status, hash, error, isBusy } =
    useRegisterEmailCommitment(verifier);
  const { isRegistered, isReady, setAt, commitmentDelay } = useEmailCommitment();

  const trimmed = email.trim();
  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 93,
    [trimmed],
  );

  const readyAt =
    setAt !== undefined && commitmentDelay !== undefined
      ? setAt + commitmentDelay
      : undefined;
  const secondsUntilReady =
    readyAt !== undefined
      ? Number(readyAt) - Math.floor(Date.now() / 1000)
      : undefined;

  const submit = async () => {
    setComputeError(null);
    setComputing(true);
    try {
      const commitment = await computeEmailCommitment(trimmed);
      await registerEmailCommitment(commitment);
    } catch (e) {
      setComputeError(e instanceof Error ? e.message : "Could not compute the commitment.");
    } finally {
      setComputing(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <EnvelopeSimple size={20} weight="duotone" />
          <h3 className="text-text-standard font-semibold">Email for flu claims</h3>
        </div>
        {isRegistered &&
          (isReady ? (
            <Badge tone="jade">Ready</Badge>
          ) : (
            <Badge tone="warning">Waiting period</Badge>
          ))}
      </div>

      <Caption className="text-surface-grey-2">
        Register the email address your healthcare provider sends to. Only a
        cryptographic hash is stored on-chain — never the address itself. You
        need this once, and it must settle for a short waiting period before a
        claim can use it.
      </Caption>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-surface-grey-2 text-sm">
          Provider email address
        </label>
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {isRegistered && !isReady && secondsUntilReady !== undefined && secondsUntilReady > 0 && (
        <Caption className="text-surface-grey-2">
          Your current commitment becomes claim-ready in{" "}
          {formatDuration(BigInt(secondsUntilReady))}. Re-registering resets this
          timer.
        </Caption>
      )}

      {computeError && <p className="text-status-error text-sm">{computeError}</p>}

      <ActionButton
        onClick={submit}
        isLoading={isBusy || computing}
        disabled={!emailValid}
      >
        {isRegistered ? "Update email commitment" : "Register email commitment"}
      </ActionButton>

      <TxStatus status={status} hash={hash} error={error} />
    </Card>
  );
}
