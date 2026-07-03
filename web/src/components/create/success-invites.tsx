"use client";

import { useAccount } from "wagmi";
import { Body } from "@breadcoop/ui";
import { InviteLinksBody } from "@/components/net/invite-panel";
import { useSafetyNetDetails } from "@/hooks/use-safety-net";
import { zeroAddress } from "viem";

/**
 * Inline invite generation right in the create-success box (app-stacks
 * StackSuccessResultModal parity: it auto-creates one link per pending
 * member on mount). The owner is the sole member at creation, so this
 * batch-signs maximumMembers − 1 single-use links — one per open seat —
 * without leaving the page.
 */
export function SuccessInvites({ id }: { id: bigint }) {
  const { address } = useAccount();
  const { data: details } = useSafetyNetDetails(id);

  if (
    !details ||
    details.safetyNet.owner === zeroAddress ||
    address?.toLowerCase() !== details.safetyNet.owner.toLowerCase()
  )
    return null;

  const memberCount = Number(details.memberCount);
  const max = Number(details.safetyNet.maximumMembers);

  return (
    <div className="border-paper-2 mt-4 border-t pt-4">
      <Body className="text-surface-grey-2 text-sm">
        Seats filled: {memberCount} of {max}.{" "}
        {max > memberCount
          ? `Share one single-use link per seat — each new member joins the
             moment they redeem theirs, and you start the net once enough
             have joined.`
          : "Your group is complete."}
      </Body>
      <InviteLinksBody details={details} autoGenerate />
    </div>
  );
}
