"use client";

import { useAccount } from "wagmi";
import { Body, Heading4 } from "@breadcoop/ui";
import { UsersThree } from "@phosphor-icons/react";
import { ActionButton } from "@/components/ui/action-button";
import { TxStatus } from "@/components/ui/tx-status";
import { Card } from "@/components/ui/ui";
import { useStartSafetyNet } from "@/hooks/use-safety-net-writes";
import type { SafetyNetDetails } from "@/lib/types";

/**
 * Pre-start banner (safetyNetStart == 0): seats-filled status for everyone
 * plus the owner-only "Start Safety Net" action. No confirm dialog —
 * app-stacks has none. Below minimumMembers the contract reverts with
 * NotEnoughMembers, so the button is disabled with the reason instead.
 */
export function StartNetBanner({ details }: { details: SafetyNetDetails }) {
  const { address } = useAccount();
  const net = details.safetyNet;
  const { start, status, hash, error, isBusy } = useStartSafetyNet();

  const isOwner = address?.toLowerCase() === net.owner.toLowerCase();
  const memberCount = Number(details.memberCount);
  const min = Number(net.minimumMembers);
  const max = Number(net.maximumMembers);
  const enoughMembers = memberCount >= min;

  return (
    <Card className="border-primary-jade/40 bg-primary-jade/5 mb-6">
      <Heading4 className="text-text-standard flex items-center gap-2">
        <UsersThree
          size={22}
          weight="fill"
          className="text-primary-jade shrink-0"
        />
        Waiting for members
      </Heading4>
      <Body className="text-surface-grey-2 mt-1 text-sm">
        {memberCount} of {max} seats filled · net not started
      </Body>

      {isOwner ? (
        <div className="mt-4 max-w-sm">
          <ActionButton
            onClick={() => start(net.id)}
            isLoading={isBusy}
            disabled={!enoughMembers}
          >
            {enoughMembers
              ? "Start Safety Net"
              : `Need at least ${min} members to start`}
          </ActionButton>
          <p className="text-surface-grey mt-2 text-xs">
            Starting locks membership — no more joins — and begins epoch 1
            dues.
          </p>
          <TxStatus
            status={status}
            hash={hash}
            error={error}
            successLabel="Safety Net started — epoch 1 is live"
          />
        </div>
      ) : (
        <p className="text-surface-grey mt-2 text-xs">
          The owner starts the net once at least {min} members have joined.
          Deposits and withdrawals open then.
        </p>
      )}
    </Card>
  );
}
