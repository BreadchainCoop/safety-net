"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { maxUint256 } from "viem";
import { Caption } from "@breadcoop/ui";
import { ActionButton } from "@/components/ui/action-button";
import { TxStatus } from "@/components/ui/tx-status";
import { Card } from "@/components/ui/ui";
import {
  useDelegatedEnabled,
  useToggleDelegated,
} from "@/hooks/use-delegated-deposits";
import { useAllowance, useApprove, useTokenInfo } from "@/hooks/use-token";
import { addressUrl, SAFETYNET_ADDRESS } from "@/lib/config";
import { formatAmount, shortenAddress } from "@/lib/format";
import type { SafetyNetDetails } from "@/lib/types";

/**
 * "Automatic deposits" opt-in for the connected member on a STARTED net
 * (DelegatedSafetyNet extension, issue #32).
 *
 * Approve → enable flow: enabling needs two txs — first approve the *main
 * proxy* to spend enough of the net's token to cover future dues, then toggle
 * `setDelegatedDepositsEnabled(true)` on the extension. If the allowance is
 * already sufficient we skip straight to the toggle. Both txs run through the
 * shared `useTx` path (so Privy + wagmi both work) and every on-chain read in
 * the app is invalidated on success.
 */
export function AutoDepositToggle({ details }: { details: SafetyNetDetails }) {
  const { address } = useAccount();
  const net = details.safetyNet;
  const { symbol, decimals } = useTokenInfo(net.token);

  const {
    data: enabled,
    isLoading: enabledLoading,
    refetch: refetchEnabled,
  } = useDelegatedEnabled(address);
  const { data: allowance, refetch: refetchAllowance } = useAllowance(
    net.token,
    address,
  );

  const approveTx = useApprove();
  const toggleTx = useToggleDelegated();

  // Two-step "Approve & enable": once the approval confirms, chain into the
  // toggle automatically so the member only clicks once.
  const [pendingEnable, setPendingEnable] = useState(false);

  useEffect(() => {
    if (approveTx.isSuccess) refetchAllowance();
  }, [approveTx.isSuccess, refetchAllowance]);

  useEffect(() => {
    if (approveTx.isSuccess && pendingEnable) {
      setPendingEnable(false);
      toggleTx.toggle(true);
    }
  }, [approveTx.isSuccess, pendingEnable, toggleTx]);

  useEffect(() => {
    if (toggleTx.isSuccess) refetchEnabled();
  }, [toggleTx.isSuccess, refetchEnabled]);

  // Enough allowance to cover at least the next epoch's dues. We approve
  // maxUint256 so future epochs are covered without re-approving; treat any
  // allowance that already covers one recurring deposit as "approved".
  const hasAllowance =
    allowance !== undefined && allowance >= net.fixedDeposit && allowance > 0n;

  const enable = () => {
    if (hasAllowance) {
      toggleTx.toggle(true);
    } else {
      setPendingEnable(true);
      approveTx.approve(net.token, maxUint256);
    }
  };

  if (enabledLoading && enabled === undefined) return null;

  if (enabled) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-2">
          <Caption className="text-surface-grey-2">Automatic deposits</Caption>
          <span className="text-system-green inline-flex items-center gap-1.5 text-xs font-bold">
            <span
              aria-hidden
              className="bg-system-green inline-block h-2 w-2 rounded-full"
            />
            On
          </span>
        </div>

        <p className="text-text-standard mt-3 text-sm">
          You&apos;re opted in. The group can top up your dues from your
          pre-approved allowance so you never miss an epoch.
        </p>

        <dl className="text-surface-grey-2 mt-3 space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt>Approved allowance</dt>
            <dd className="text-text-standard font-medium">
              {allowance !== undefined && allowance >= maxUint256 / 2n
                ? "Unlimited"
                : `${formatAmount(allowance, decimals)} ${symbol}`}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Spender (proxy)</dt>
            <dd>
              <a
                href={addressUrl(SAFETYNET_ADDRESS)}
                target="_blank"
                rel="noreferrer"
                className="text-primary-jade hover:underline"
              >
                {shortenAddress(SAFETYNET_ADDRESS)}
              </a>
            </dd>
          </div>
        </dl>

        <p className="text-surface-grey-2 mt-3 text-xs">
          Turning this off — or reducing your allowance to the proxy — stops
          automatic deposits. Your funds only ever move as dues into this net.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <ActionButton
            variant="destructive"
            onClick={() => toggleTx.toggle(false)}
            isLoading={toggleTx.isBusy}
          >
            Turn off automatic deposits
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => approveTx.approve(net.token, maxUint256)}
            isLoading={approveTx.isBusy}
          >
            Manage allowance (re-approve unlimited)
          </ActionButton>
        </div>
        <TxStatus
          status={toggleTx.status}
          hash={toggleTx.hash}
          error={toggleTx.error}
          successLabel="Automatic deposits updated"
        />
        {toggleTx.status === "idle" && (
          <TxStatus
            status={approveTx.status}
            hash={approveTx.hash}
            error={approveTx.error}
            successLabel="Allowance updated"
          />
        )}
      </Card>
    );
  }

  const enabling = pendingEnable || approveTx.isBusy || toggleTx.isBusy;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Caption className="text-surface-grey-2">Automatic deposits</Caption>
        <span className="text-surface-grey-2 text-xs font-bold">Off</span>
      </div>

      <p className="text-text-standard mt-3 text-sm">
        Never miss an epoch — let the group top up your dues from a pre-approved
        allowance. Opt in and a keeper or another member can pay your owed dues
        for you. It&apos;s non-custodial: funds only ever move as dues into this
        net, up to the allowance you approve, and you can revoke any time by
        turning it off or reducing the allowance.
      </p>

      {!hasAllowance && (
        <p className="text-surface-grey-2 mt-3 text-xs">
          Enabling takes two quick steps: approve the SafetyNet proxy to spend{" "}
          {symbol} (we approve an unlimited amount so future epochs are covered),
          then switch automatic deposits on.
        </p>
      )}

      <div className="mt-4">
        <ActionButton onClick={enable} isLoading={enabling}>
          {hasAllowance ? "Enable automatic deposits" : "Approve & enable"}
        </ActionButton>
      </div>

      <TxStatus
        status={approveTx.status}
        hash={approveTx.hash}
        error={approveTx.error}
        successLabel={
          pendingEnable || toggleTx.status !== "idle"
            ? "Approved — enabling…"
            : "Allowance approved"
        }
      />
      <TxStatus
        status={toggleTx.status}
        hash={toggleTx.hash}
        error={toggleTx.error}
        successLabel="Automatic deposits on"
      />
    </Card>
  );
}
