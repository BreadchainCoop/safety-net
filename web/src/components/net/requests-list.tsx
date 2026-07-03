"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Caption } from "@breadcoop/ui";
import { AddressDisplay } from "@/components/ui/address-display";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TimeDisplay } from "@/components/ui/time-display";
import { TxStatus } from "@/components/ui/tx-status";
import { ActionButton } from "@/components/ui/action-button";
import { Badge, Card, EmptyState } from "@/components/ui/ui";
import { useNow } from "@/hooks/use-now";
import { useHasContested } from "@/hooks/use-safety-net";
import {
  useContest,
  useExecuteContestedWithdrawal,
} from "@/hooks/use-safety-net-writes";
import { useTokenInfo } from "@/hooks/use-token";
import { formatAmount, shortenAddress } from "@/lib/format";
import {
  requestStatus,
  type RequestView,
  type SafetyNetDetails,
} from "@/lib/types";

function RequestRow({
  view,
  details,
  hasContested,
}: {
  view: RequestView;
  details: SafetyNetDetails;
  hasContested: boolean;
}) {
  const { address } = useAccount();
  const now = useNow();
  const net = details.safetyNet;
  const { symbol, decimals } = useTokenInfo(net.token);
  const contestTx = useContest();
  const executeTx = useExecuteContestedWithdrawal();
  const [confirmingContest, setConfirmingContest] = useState(false);

  const status = requestStatus(view);
  const contestEnds = view.request.timestamp + net.contestWindow;
  // The contract-derived isContestable flag only updates on refetch; also gate
  // on the live clock so the button can't be clicked after the window closed.
  const contestWindowClosed = now >= Number(contestEnds);
  const memberCount = Number(details.memberCount);
  const votesToVeto =
    Math.floor((memberCount * Number(net.contestThreshold)) / 100) + 1;
  const isMine = view.request.owner.toLowerCase() === address?.toLowerCase();

  return (
    <li className="border-paper-2 border-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="font-breadDisplay text-text-standard font-bold">
            {formatAmount(view.request.amount, decimals)} {symbol}
          </span>
          <span className="text-surface-grey-2 text-sm">
            by <AddressDisplay address={view.request.owner} />
            {isMine && (
              <Badge tone="jade" className="ml-1.5">
                you
              </Badge>
            )}
          </span>
        </span>
        {status === "executed" ? (
          <Badge tone="green">Paid out</Badge>
        ) : status === "vetoed" ? (
          <Badge tone="red">Vetoed</Badge>
        ) : status === "executable" ? (
          <Badge tone="warning">Executable now</Badge>
        ) : (
          <Badge tone="jade">
            Contest ends&nbsp;
            <TimeDisplay timestamp={contestEnds} />
          </Badge>
        )}
      </div>

      {view.reason.trim() !== "" ? (
        <blockquote className="border-primary-jade/60 bg-paper-main text-text-standard mt-3 rounded-r-md border-l-2 px-3 py-2 text-sm italic">
          &ldquo;{view.reason}&rdquo;
        </blockquote>
      ) : (
        <p className="text-surface-grey mt-3 text-sm italic">No reason given</p>
      )}

      <div className="text-surface-grey mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>
          Requested <TimeDisplay timestamp={view.request.timestamp} />
        </span>
        <span>
          {view.request.contestCount.toString()} of {votesToVeto} contests
          needed to veto
        </span>
        <span className="text-surface-grey-2">
          Request #{view.id.toString()}
        </span>
      </div>

      {status === "contestable" && details.isMember && (
        <div className="mt-3 max-w-xs">
          <ActionButton
            variant="destructive"
            onClick={() => setConfirmingContest(true)}
            isLoading={contestTx.isBusy}
            disabled={hasContested || contestWindowClosed}
          >
            {hasContested
              ? "You contested this"
              : contestWindowClosed
                ? "Contest window ended"
                : "Contest"}
          </ActionButton>
          <TxStatus
            status={contestTx.status}
            hash={contestTx.hash}
            error={contestTx.error}
            successLabel="Contest recorded"
          />
          <ConfirmDialog
            open={confirmingContest}
            title="Contest this withdrawal?"
            confirmLabel="Yes, contest it"
            destructive
            onConfirm={() => {
              setConfirmingContest(false);
              contestTx.contest(view.id);
            }}
            onCancel={() => setConfirmingContest(false)}
          >
            You&apos;re voting to veto the withdrawal of{" "}
            {formatAmount(view.request.amount, decimals)} {symbol} requested by{" "}
            {shortenAddress(view.request.owner)}. A contest can&apos;t be
            withdrawn once cast —
            if {votesToVeto} of {memberCount} members contest, the request is
            permanently vetoed and no funds move.
          </ConfirmDialog>
        </div>
      )}

      {status === "executable" && (
        <div className="mt-3 max-w-xs">
          <ActionButton
            onClick={() => executeTx.execute(view.id)}
            isLoading={executeTx.isBusy}
          >
            Execute withdrawal
          </ActionButton>
          <TxStatus
            status={executeTx.status}
            hash={executeTx.hash}
            error={executeTx.error}
            successLabel="Withdrawal executed"
          />
        </div>
      )}
    </li>
  );
}

/** All withdrawal requests of a net, newest first, with contest/execute actions. */
export function RequestsList({ details }: { details: SafetyNetDetails }) {
  const requests = useMemo(
    () => [...details.requests].reverse(),
    [details.requests],
  );
  const requestIds = useMemo(() => requests.map((r) => r.id), [requests]);
  const contestedMap = useHasContested(requestIds);

  if (requests.length === 0)
    return (
      <EmptyState>
        No withdrawal requests yet. Large withdrawals show up here for the group
        to review.
      </EmptyState>
    );

  return (
    <Card>
      <Caption className="text-surface-grey-2">
        Withdrawal requests ({requests.length})
      </Caption>
      <ul className="mt-2">
        {requests.map((view) => (
          <RequestRow
            key={view.id.toString()}
            view={view}
            details={details}
            hasContested={contestedMap.get(view.id) ?? false}
          />
        ))}
      </ul>
    </Card>
  );
}
