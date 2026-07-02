"use client";

import { Caption } from "@breadcoop/ui";
import { ActionButton } from "@/components/ui/action-button";
import { TxStatus } from "@/components/ui/tx-status";
import { Card } from "@/components/ui/ui";
import { useDecommission } from "@/hooks/use-safety-net-writes";
import type { SafetyNetDetails } from "@/lib/types";

/**
 * Wind down the Safety Net. The contract allows this once any member has
 * missed their dues in a past epoch; everyone's withdrawable balance (plus a
 * share of the remainder) is returned.
 */
export function DecommissionPanel({ details }: { details: SafetyNetDetails }) {
  const { decommission, status, hash, error, isBusy } = useDecommission();

  return (
    <Card>
      <Caption className="text-surface-grey-2">Wind down</Caption>
      <p className="text-surface-grey mt-2 text-xs">
        If a member missed their dues in a past epoch, anyone can decommission
        the Safety Net: withdrawable balances are paid back to each member and
        any remainder is split evenly.
      </p>
      {!details.isDecommissionable && (
        <p className="text-system-green mt-2 text-xs font-medium">
          Everyone is up to date — this Safety Net can&apos;t be wound down.
        </p>
      )}
      <div className="mt-4">
        <ActionButton
          variant="destructive"
          onClick={() => decommission(details.safetyNet.id)}
          isLoading={isBusy}
          disabled={!details.isDecommissionable}
        >
          Decommission Safety Net
        </ActionButton>
        <TxStatus
          status={status}
          hash={hash}
          error={error}
          successLabel="Safety Net wound down — funds returned to members"
        />
      </div>
    </Card>
  );
}
