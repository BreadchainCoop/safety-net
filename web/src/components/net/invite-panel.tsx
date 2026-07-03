"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Caption, CopyButtonIcon } from "@breadcoop/ui";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { Badge, Card } from "@/components/ui/ui";
import { inviteLink, useInviteLinks } from "@/hooks/use-invite";
import { useInviteNoncesUsed } from "@/hooks/use-safety-net";
import type { SafetyNetDetails } from "@/lib/types";

/**
 * Invite generation + tracking body (app-stacks StackSuccessResultModal /
 * StackMembers parity, GitHub issue #66): batch-signs single-use EIP-712
 * invites with signing progress, and lists every link generated in this
 * browser with per-row copy and live Accepted/Pending status from usedNonces.
 * Rendered inside the owner-only InvitePanel and the create-success box.
 *
 * With `autoGenerate` (create-success box, app-stacks StackSuccessResultModal
 * parity) the batch signing starts on mount — one link per open seat — as
 * soon as the persisted links have loaded and only when none exist yet. On
 * failure the signed links are kept and the generate button doubles as retry.
 */
export function InviteLinksBody({
  details,
  autoGenerate = false,
}: {
  details: SafetyNetDetails;
  autoGenerate?: boolean;
}) {
  const net = details.safetyNet;
  const { invites, isLoaded, generate, progress, isGenerating, error } =
    useInviteLinks(net.id);
  const countId = useId();

  const remaining = Math.max(
    0,
    Number(net.maximumMembers) - Number(details.memberCount),
  );
  const full = remaining === 0;
  const [count, setCount] = useState(() => Math.max(1, remaining));

  // Auto-start batch generation once per mount (never on top of links that
  // already exist in this browser).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoGenerate || autoStarted.current || !isLoaded) return;
    autoStarted.current = true;
    if (invites.length === 0 && remaining > 0) void generate(remaining);
  }, [autoGenerate, isLoaded, invites.length, remaining, generate]);

  const nonces = useMemo(
    () => invites.map((inv) => BigInt(inv.nonce)),
    [invites],
  );
  const used = useInviteNoncesUsed(net.id, nonces);
  const acceptedCount = used.filter(Boolean).length;

  const clamped = Math.min(
    Math.max(1, Math.floor(count) || 1),
    Math.max(1, remaining),
  );

  return (
    <div>
      {full && (
        <p className="text-system-warning mt-2 text-xs font-medium">
          The group is at its maximum of {net.maximumMembers.toString()} members
          — new invites can&apos;t be redeemed until someone leaves.
        </p>
      )}

      {!full && (
        <div className="mt-4 flex items-end gap-2">
          <div>
            <label htmlFor={countId}>
              <Caption className="text-surface-grey-2">Links</Caption>
            </label>
            <input
              id={countId}
              type="number"
              min={1}
              max={remaining}
              value={count}
              disabled={isGenerating}
              onChange={(e) => setCount(Number(e.target.value))}
              className="border-paper-2 bg-paper-main text-text-standard focus:border-primary-jade mt-1.5 w-20 rounded-xl border px-3 py-2.5 outline-none disabled:opacity-60"
            />
          </div>
          <ActionButton
            onClick={() => generate(clamped)}
            isLoading={isGenerating}
            className="w-full"
          >
            <span className="inline-flex items-center gap-2">
              <PaperPlaneTilt size={16} weight="fill" /> Generate{" "}
              {clamped === 1 ? "invite link" : `${clamped} invite links`}
            </span>
          </ActionButton>
        </div>
      )}
      {progress && (
        <p role="status" className="text-primary-jade mt-2 text-xs font-medium">
          {progress}
        </p>
      )}
      {error && (
        <p className="text-system-red mt-2 text-xs font-medium">
          {error} Links signed before the interruption were kept below.
        </p>
      )}

      {invites.length > 0 && (
        <>
          <div className="text-surface-grey-2 mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span>
              Invited:{" "}
              <span className="text-text-standard font-bold">
                {invites.length}
              </span>
            </span>
            <span>
              Accepted:{" "}
              <span className="text-text-standard font-bold">
                {acceptedCount}
              </span>
            </span>
            <span>
              Pending:{" "}
              <span className="text-text-standard font-bold">
                {invites.length - acceptedCount}
              </span>
            </span>
          </div>

          <ul className="mt-2 flex max-h-96 flex-col gap-2 overflow-y-auto">
            {invites.map((inv, i) => {
              const link = inviteLink(net.id, inv);
              const isUsed = used[i] === true;
              return (
                <li
                  key={inv.nonce}
                  className="border-paper-2 bg-paper-main flex items-center gap-2 rounded-xl border px-3 py-2"
                >
                  <span className="text-surface-grey font-mono text-xs">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <input
                    readOnly
                    aria-label={`Invite link ${i + 1}`}
                    value={link}
                    onFocus={(e) => e.target.select()}
                    className="text-text-standard w-full min-w-0 bg-transparent font-mono text-xs outline-none"
                  />
                  <Badge tone={isUsed ? "green" : "warning"}>
                    {isUsed ? "Accepted" : "Pending"}
                  </Badge>
                  <CopyButtonIcon
                    textToCopy={link}
                    aria-label={`Copy invite link ${i + 1}`}
                    checkedIconSize={16}
                    className="shrink-0 [&>svg]:h-4 [&>svg]:w-4"
                  />
                </li>
              );
            })}
          </ul>

          <p className="text-surface-grey mt-3 text-xs">
            <span className="text-system-warning font-bold">Reminder: </span>
            each link is unique and can only be used once. Links are saved only
            in this browser — share them privately.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Owner-only: signs EIP-712 invites (domain "SafetyNetInvite" v1, type
 * Invite(uint256 safetyNetId,uint256 nonce)) and manages the single-use
 * /join links to share.
 */
export function InvitePanel({ details }: { details: SafetyNetDetails }) {
  const { address } = useAccount();
  const net = details.safetyNet;

  const isOwner = address?.toLowerCase() === net.owner.toLowerCase();
  if (!isOwner) return null;

  return (
    <Card>
      <Caption className="text-surface-grey-2">Invite members</Caption>
      <p className="text-surface-grey mt-2 text-xs">
        As the owner you can invite people by signing invite links. Each link
        can be used once; the new member joins the moment they redeem it (no
        transaction needed from you). Invites only work before the net starts
        — starting locks membership.
      </p>
      <InviteLinksBody details={details} />
    </Card>
  );
}
