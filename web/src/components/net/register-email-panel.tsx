"use client";

import { useId, useMemo, useState } from "react";
import { Caption } from "@breadcoop/ui";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { NoteBox } from "@/components/ui/note-box";
import { TxStatus } from "@/components/ui/tx-status";
import { Badge, Card } from "@/components/ui/ui";
import { useRegisterEmailCommitment } from "@/hooks/use-safety-net-writes";
import { useEmailCommitment } from "@/hooks/use-flu-claim";
import { computeEmailCommitment, MAX_TO_ADDR_LENGTH } from "@/lib/flu-claim";
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
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= MAX_TO_ADDR_LENGTH,
    [trimmed],
  );

  const readyAt =
    setAt !== undefined && commitmentDelay !== undefined ? setAt + commitmentDelay : undefined;
  const secondsUntilReady =
    readyAt !== undefined ? Number(readyAt) - Math.floor(Date.now() / 1000) : undefined;

  const submit = async () => {
    setComputeError(null);
    setComputing(true);
    try {
      const commitment = await computeEmailCommitment(trimmed);
      await registerEmailCommitment(commitment);
    } catch (e) {
      setComputeError(
        e instanceof Error ? e.message : "Could not compute the commitment.",
      );
    } finally {
      setComputing(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <EnvelopeSimple size={18} weight="duotone" className="text-primary-jade" />
          <Caption className="text-surface-grey-2">Email for flu claims</Caption>
        </div>
        {isRegistered &&
          (isReady ? (
            <Badge tone="jade">Ready</Badge>
          ) : (
            <Badge tone="warning">Waiting period</Badge>
          ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <NoteBox icon>
          Register the email address your healthcare provider sends to. Only a
          cryptographic hash is stored on-chain — never the address itself. You
          need this once, and it settles for a short waiting period before a
          claim can use it.
        </NoteBox>

        <div>
          <label htmlFor={emailId}>
            <Caption className="text-surface-grey-2">Provider email address</Caption>
          </label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            className={`${inputClass} mt-1.5`}
            value={email}
            aria-invalid={(trimmed !== "" && !emailValid) || undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {isRegistered && !isReady && secondsUntilReady !== undefined && secondsUntilReady > 0 && (
          <p className="text-system-warning text-xs font-medium">
            Your current commitment becomes claim-ready in{" "}
            {formatDuration(BigInt(secondsUntilReady))}. Re-registering resets this timer.
          </p>
        )}

        {computeError && <p className="text-system-red text-xs font-medium">{computeError}</p>}

        <ActionButton onClick={submit} isLoading={isBusy || computing} disabled={!emailValid}>
          {isRegistered ? "Update email commitment" : "Register email commitment"}
        </ActionButton>

        <TxStatus
          status={status}
          hash={hash}
          error={error}
          successLabel="Email commitment registered"
        />
      </div>
    </Card>
  );
}
