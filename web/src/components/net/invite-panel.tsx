"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Caption, CopyButtonIcon } from "@breadcoop/ui";
import {
  CopySimple,
  DownloadSimple,
  PaperPlaneTilt,
  QrCode as QrCodeIcon,
} from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { QrCode } from "@/components/ui/qr-code";
import { Badge, Card } from "@/components/ui/ui";
import { inviteLink, useInviteLinks } from "@/hooks/use-invite";
import { useInviteNoncesUsed, useSafetyNetName } from "@/hooks/use-safety-net";
import { useToast } from "@/hooks/use-toast";
import { ADDRESSES, CHAIN_ID } from "@/lib/config";
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
  const { toast } = useToast();
  const countId = useId();
  // Which invite row (if any) has its scannable QR expanded — one at a time.
  const [qrIndex, setQrIndex] = useState<number | null>(null);

  // Invites live only in this browser's localStorage; if it's blocked (private
  // mode / storage disabled) they vanish on refresh, so nudge the owner to
  // export. We probe once on mount rather than trusting the silent save.
  const [storageBlocked, setStorageBlocked] = useState(false);
  useEffect(() => {
    try {
      const probe = "__sn_invite_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
    } catch {
      setStorageBlocked(true);
    }
  }, []);

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
  const { data: netName } = useSafetyNetName(net.id);

  const links = useMemo(
    () => invites.map((inv) => inviteLink(net.id, inv)),
    [invites, net.id],
  );

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(links.join("\n"));
      toast({
        tone: "success",
        message: `Copied ${links.length} invite ${links.length === 1 ? "link" : "links"}.`,
      });
    } catch {
      toast({
        tone: "error",
        message: "Couldn't copy — use the copy button on each link instead.",
      });
    }
  };

  // Download a self-contained JSON backup so links survive a cleared browser or
  // a move to a new device (the only place they otherwise exist).
  const downloadJson = () => {
    const payload = {
      safetyNet: netName || `Safety Net #${net.id.toString()}`,
      safetyNetId: net.id.toString(),
      chainId: CHAIN_ID,
      contract: ADDRESSES.safetyNet,
      exportedAt: new Date().toISOString(),
      note: "Each link is single-use. Anyone with a pending link can join this net — keep this file private.",
      invites: invites.map((inv, i) => ({
        index: i + 1,
        nonce: inv.nonce,
        status: used[i] === true ? "accepted" : "pending",
        link: links[i],
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `safety-net-${net.id.toString()}-invites.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const clamped = Math.min(
    Math.max(1, Math.floor(count) || 1),
    Math.max(1, remaining),
  );

  return (
    <div>
      {storageBlocked && invites.length > 0 && (
        <p className="border-red-1 bg-red-0/60 text-red-main mt-2 rounded-xl border px-3 py-2 text-xs font-medium">
          This browser is blocking local storage, so these links won&apos;t be
          saved. Download or copy them now — they&apos;ll be lost on refresh.
        </p>
      )}

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

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyAll}
              className="border-paper-2 text-surface-grey-2 hover:border-primary-jade hover:text-primary-jade inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors"
            >
              <CopySimple size={14} weight="bold" /> Copy all
            </button>
            <button
              type="button"
              onClick={downloadJson}
              className="border-paper-2 text-surface-grey-2 hover:border-primary-jade hover:text-primary-jade inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors"
            >
              <DownloadSimple size={14} weight="bold" /> Download backup
            </button>
          </div>

          <ul className="mt-2 flex max-h-96 flex-col gap-2 overflow-y-auto">
            {invites.map((inv, i) => {
              const link = inviteLink(net.id, inv);
              const isUsed = used[i] === true;
              return (
                <li
                  key={inv.nonce}
                  className="border-paper-2 bg-paper-main flex flex-col gap-2 rounded-xl border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
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
                    <button
                      type="button"
                      onClick={() =>
                        setQrIndex((cur) => (cur === i ? null : i))
                      }
                      aria-expanded={qrIndex === i}
                      aria-label={
                        qrIndex === i
                          ? `Hide QR code for invite ${i + 1}`
                          : `Show QR code for invite ${i + 1}`
                      }
                      className={`shrink-0 transition-colors ${
                        qrIndex === i
                          ? "text-primary-jade"
                          : "text-surface-grey hover:text-primary-jade"
                      }`}
                    >
                      <QrCodeIcon size={16} weight="bold" />
                    </button>
                    <CopyButtonIcon
                      textToCopy={link}
                      aria-label={`Copy invite link ${i + 1}`}
                      checkedIconSize={16}
                      className="shrink-0 [&>svg]:h-4 [&>svg]:w-4"
                    />
                  </div>
                  {qrIndex === i && (
                    <div className="border-paper-2 flex flex-col items-center gap-1.5 border-t pt-2">
                      <div className="rounded-lg bg-white p-2">
                        <QrCode value={link} size={168} />
                      </div>
                      <span className="text-surface-grey text-[11px]">
                        Scan with a phone to open this invite
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="text-surface-grey mt-3 text-xs">
            <span className="text-system-warning font-bold">Reminder: </span>
            each link is unique and can only be used once. They&apos;re saved
            only in this browser — <strong>download a backup</strong> so you
            don&apos;t lose them if you clear your browser or switch devices, and
            share them privately.
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
