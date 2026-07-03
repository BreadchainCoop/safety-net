"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { isHex, zeroAddress } from "viem";
import { ConfettiIcon } from "@phosphor-icons/react";
import { Caption } from "@breadcoop/ui";
import { ActionButton } from "@/components/ui/action-button";
import { AddressDisplay } from "@/components/ui/address-display";
import { DepositPanel } from "@/components/net/deposit-panel";
import { TxStatus } from "@/components/ui/tx-status";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  InfoRow,
  LoadingState,
  PageHeader,
} from "@/components/ui/ui";
import {
  useInviteNonceUsed,
  useSafetyNetDetails,
} from "@/hooks/use-safety-net";
import { useRedeemInvite } from "@/hooks/use-safety-net-writes";
import { useTokenInfo } from "@/hooks/use-token";
import { isContractConfigured } from "@/lib/config";
import { formatAmount, formatDuration } from "@/lib/format";
import { parseContractError } from "@/lib/parse-contract-error";

/** Parses /join/?net=ID&nonce=N&sig=0x… and redeems the owner-signed invite. */
function JoinInner() {
  const params = useSearchParams();
  const { isConnected } = useAccount();

  const invite = useMemo(() => {
    try {
      const net = params.get("net");
      const nonce = params.get("nonce");
      const sig = params.get("sig");
      if (net === null || nonce === null || sig === null || !isHex(sig))
        return null;
      return {
        safetyNetId: BigInt(net),
        nonce: BigInt(nonce),
        signature: sig,
      };
    } catch {
      return null;
    }
  }, [params]);

  const {
    data: details,
    isLoading,
    error,
  } = useSafetyNetDetails(invite?.safetyNetId);
  const { data: nonceUsed } = useInviteNonceUsed(
    invite?.safetyNetId,
    invite?.nonce,
  );
  const redeemTx = useRedeemInvite();

  // One-shot confetti burst on successful redeem (decorative; respects
  // prefers-reduced-motion). canvas-confetti is imported dynamically so it
  // stays out of the initial bundle and never runs during SSR.
  const celebrated = useRef(false);
  useEffect(() => {
    if (!redeemTx.isSuccess || celebrated.current) return;
    celebrated.current = true;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    void import("canvas-confetti").then(({ default: confetti }) => {
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    });
  }, [redeemTx.isSuccess]);

  const net = details?.safetyNet;
  const { symbol, decimals } = useTokenInfo(
    net && net.owner !== zeroAddress ? net.token : undefined,
  );

  if (!invite)
    return (
      <ErrorState>
        This invite link is malformed — it should look like
        /join/?net=…&nonce=…&sig=0x…. Ask the owner to generate a new one.
      </ErrorState>
    );

  if (!isContractConfigured)
    return (
      <EmptyState>
        The SafetyNet contract address isn&apos;t configured yet — the invite
        can&apos;t be checked. See the banner above.
      </EmptyState>
    );

  if (isLoading || (!details && !error))
    return <LoadingState label="Loading invite…" />;

  if (error) return <ErrorState>{parseContractError(error)}</ErrorState>;

  if (!net || net.owner === zeroAddress)
    return (
      <EmptyState>
        Safety Net #{invite.safetyNetId.toString()} doesn&apos;t exist or has
        been wound down — this invite can no longer be used.
      </EmptyState>
    );

  const full = details.memberCount >= net.maximumMembers;
  // Joining is only possible before start() — after that redeemInvite
  // reverts with AlreadyActive, so pre-check instead of letting it revert.
  const started = net.safetyNetStart !== 0n;

  const joined = details.isMember || redeemTx.isSuccess;

  return (
    <Card>
      {!joined && (
        <div className="mb-5 flex flex-col items-center text-center">
          <ConfettiIcon
            className="text-primary-jade size-16"
            weight="fill"
            aria-hidden
          />
          <h2 className="font-breadDisplay text-text-standard mt-2 text-2xl font-bold">
            You&apos;re invited!
          </h2>
          <p className="text-surface-grey-2 mt-1 text-sm">
            Accept this invite to join the group&apos;s savings safety net.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Caption className="text-surface-grey-2">
          You&apos;ve been invited to
        </Caption>
        {started && !details.isMember && (
          <Badge tone="warning">Already started</Badge>
        )}
        {nonceUsed === true && <Badge tone="red">Invite already used</Badge>}
        {full && <Badge tone="warning">Group is full</Badge>}
      </div>
      <h3 className="font-breadDisplay text-text-standard mt-1 text-2xl font-bold">
        Safety Net #{net.id.toString()}
      </h3>

      <div className="mt-4">
        <InfoRow label="Owner">
          <AddressDisplay address={net.owner} />
        </InfoRow>
        <InfoRow label="Members">
          {details.memberCount.toString()} (max {net.maximumMembers.toString()})
        </InfoRow>
        <InfoRow label="Joining payment">
          {formatAmount(net.initialDeposit, decimals)} {symbol} once
        </InfoRow>
        <InfoRow label="Recurring dues">
          {formatAmount(net.fixedDeposit, decimals)} {symbol} every{" "}
          {formatDuration(net.epochDuration)}
        </InfoRow>
        <InfoRow label="Pool balance">
          {formatAmount(details.totalBalance, decimals)} {symbol}
        </InfoRow>
      </div>

      <p className="text-surface-grey mt-4 text-xs">
        Joining adds your wallet as a member. You&apos;ll then pay the initial
        deposit of {formatAmount(net.initialDeposit, decimals)} {symbol} to
        activate your membership, and {formatAmount(net.fixedDeposit, decimals)}{" "}
        {symbol} in dues each epoch after that.
      </p>

      <div className="border-system-warning/40 bg-system-warning/10 mt-4 rounded-xl border p-3">
        <p className="text-system-warning text-xs font-medium">
          Important: this invite can only be accepted once. If someone else
          redeems this link first, it stops working.
        </p>
      </div>

      <div className="mt-4">
        {joined ? (
          <div className="flex flex-col gap-4">
            <div className="border-system-green/40 bg-system-green/10 rounded-xl border p-3">
              <p className="text-system-green text-sm font-medium">
                Welcome aboard — you&apos;re member{" "}
                {details.memberCount.toString()} of{" "}
                {net.maximumMembers.toString()}. Pay your initial deposit below
                to activate your membership.
              </p>
            </div>

            {details.isMember ? (
              <>
                {/* Guided first deposit inline — DepositPanel's onboarding
                    branch locks the amount to the initial deposit. Gated on the
                    refetched details.isMember so it doesn't render mid-redeem
                    while the cache still says non-member. */}
                <DepositPanel details={details} />
                <Link
                  href={`/net/?id=${net.id}`}
                  className="text-primary-jade text-sm font-medium underline"
                >
                  Open Safety Net #{net.id.toString()} →
                </Link>
              </>
            ) : (
              <p className="text-surface-grey text-sm">
                Confirming membership…
              </p>
            )}
          </div>
        ) : started ? (
          <p className="bg-paper-2 text-surface-grey-2 rounded-xl px-4 py-3 text-center text-sm font-medium">
            This Safety Net has already started — joining is closed.
          </p>
        ) : nonceUsed === true ? (
          <p className="bg-paper-2 text-surface-grey-2 rounded-xl px-4 py-3 text-center text-sm font-medium">
            This invite has already been used — ask the owner for a new link.
          </p>
        ) : (
          <>
            {!isConnected && (
              <p className="text-surface-grey mb-2 text-xs">
                Connect your wallet to accept this invite.
              </p>
            )}
            <ActionButton
              onClick={() =>
                redeemTx.redeemInvite(
                  { safetyNetId: invite.safetyNetId, nonce: invite.nonce },
                  invite.signature,
                )
              }
              isLoading={redeemTx.isBusy}
              disabled={full}
            >
              Accept invite
            </ActionButton>
            <TxStatus
              status={redeemTx.status}
              hash={redeemTx.hash}
              error={redeemTx.error}
              successLabel="Welcome aboard!"
            />
          </>
        )}
      </div>
    </Card>
  );
}

/** Client body of /join — the page itself is a server wrapper with metadata. */
export function JoinContent() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Join a Safety Net"
        subtitle="Redeem an invite signed by the group's owner."
      />
      <Suspense fallback={<LoadingState label="Loading invite…" />}>
        <JoinInner />
      </Suspense>
    </div>
  );
}
