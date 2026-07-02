"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Caption, CopyButtonIcon } from "@breadcoop/ui";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/ui";
import { useSignInvite, type SignedInvite } from "@/hooks/use-invite";
import type { SafetyNetDetails } from "@/lib/types";

/**
 * Owner-only: signs an EIP-712 invite (domain "SafetyNetInvite" v1, type
 * Invite(uint256 safetyNetId,uint256 nonce)) and produces a single-use
 * /join link to share (GitHub issue #66).
 */
export function InvitePanel({ details }: { details: SafetyNetDetails }) {
  const { address } = useAccount();
  const net = details.safetyNet;
  const { sign, isPending, error } = useSignInvite();
  const [invite, setInvite] = useState<SignedInvite | null>(null);

  const isOwner = address?.toLowerCase() === net.owner.toLowerCase();
  if (!isOwner) return null;

  const full = details.memberCount >= net.maximumMembers;

  return (
    <Card>
      <Caption className="text-surface-grey-2">Invite a member</Caption>
      <p className="text-surface-grey mt-2 text-xs">
        As the owner you can invite people by signing an invite link. Each link
        can be used once; the new member joins the moment they redeem it (no
        transaction needed from you).
      </p>

      {full && (
        <p className="text-system-warning mt-2 text-xs font-medium">
          The group is at its maximum of {net.maximumMembers.toString()} members
          — new invites can&apos;t be redeemed until someone leaves.
        </p>
      )}

      <div className="mt-4">
        <ActionButton
          onClick={async () => {
            const signed = await sign(net.id);
            if (signed) setInvite(signed);
          }}
          isLoading={isPending}
        >
          <span className="inline-flex items-center gap-2">
            <PaperPlaneTilt size={16} weight="fill" /> Generate invite link
          </span>
        </ActionButton>
        {error && (
          <p className="text-system-red mt-2 text-xs font-medium">{error}</p>
        )}
      </div>

      {invite && (
        <div className="border-primary-jade/40 bg-primary-jade/5 mt-3 rounded-xl border p-3">
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label="Invite link"
              value={invite.link}
              onFocus={(e) => e.target.select()}
              className="text-text-standard w-full bg-transparent font-mono text-xs outline-none"
            />
            <CopyButtonIcon
              textToCopy={invite.link}
              aria-label="Copy invite link"
              checkedIconSize={16}
              className="shrink-0 [&>svg]:h-4 [&>svg]:w-4"
            />
          </div>
          <p className="text-surface-grey mt-2 text-xs">
            Share this link privately — anyone with it can join (once).
          </p>
        </div>
      )}
    </Card>
  );
}
