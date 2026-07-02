"use client";

import { useState } from "react";
import { Caption } from "@breadcoop/ui";
import { ActionButton } from "@/components/ui/action-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TxStatus } from "@/components/ui/tx-status";
import { Card } from "@/components/ui/ui";
import { useDecommission } from "@/hooks/use-safety-net-writes";
import { useTokenInfo } from "@/hooks/use-token";
import { formatAmount } from "@/lib/format";
import type { SafetyNetDetails } from "@/lib/types";

/**
 * Wind down the Safety Net. The contract allows this once any member has
 * missed their dues in a past epoch; everyone's withdrawable balance (plus a
 * share of the remainder) is returned. Irreversible, so the action sits
 * behind an explicit confirmation dialog (P0 gap 1).
 */
export function DecommissionPanel({ details }: { details: SafetyNetDetails }) {
  const { decommission, status, hash, error, isBusy } = useDecommission();
  const { symbol, decimals } = useTokenInfo(details.safetyNet.token);
  const [confirming, setConfirming] = useState(false);

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
          onClick={() => setConfirming(true)}
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

      <ConfirmDialog
        open={confirming}
        title="Wind down this Safety Net?"
        confirmLabel="Yes, decommission it"
        destructive
        onConfirm={() => {
          setConfirming(false);
          decommission(details.safetyNet.id);
        }}
        onCancel={() => setConfirming(false)}
      >
        This permanently closes Safety Net #{details.safetyNet.id.toString()}{" "}
        for everyone. Each member gets their withdrawable balance back
        {details.isMember && details.withdrawableBalance > 0n ? (
          <>
            {" "}
            (yours: {formatAmount(details.withdrawableBalance, decimals)}{" "}
            {symbol})
          </>
        ) : null}
        , and whatever remains in the pool is split evenly between members.
        This can&apos;t be undone.
      </ConfirmDialog>
    </Card>
  );
}
