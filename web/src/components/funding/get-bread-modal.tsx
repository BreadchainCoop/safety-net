"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";
import { Body, Button, Heading4 } from "@breadcoop/ui";
import { AmountField } from "@/components/ui/amount-field";
import { TxStatus } from "@/components/ui/tx-status";
import { PRIVY_ENABLED } from "@/lib/config";
import { formatAmount, parseAmount } from "@/lib/format";
import { GAS_RESERVE_XDAI, useBreadFunding } from "@/hooks/use-bread-funding";

/** Below this much xDAI we nudge the user toward the (Privy) onramp. */
const LOW_XDAI = GAS_RESERVE_XDAI;

/**
 * "Get BREAD" funding modal. BREAD is the Safety Net savings token and mints
 * 1:1 from xDAI via BREAD's payable `mint(receiver)` (app-stacks
 * fund-wallet / use-auto-bake-bread pattern).
 *
 * Shows live BREAD + xDAI balances; when Privy is enabled and xDAI is low it
 * offers a "Buy xDAI" onramp; and it mints N BREAD from N xDAI (reserving a
 * little xDAI for gas on MAX). Works in both wagmi and Privy-sponsored modes —
 * minting routes through the shared `useTx` path.
 */
export function GetBreadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState("");

  const {
    breadBalance,
    xdaiBalance,
    refetchBreadBalance,
    refetchXdaiBalance,
    mintBread,
    tx,
    openOnramp,
  } = useBreadFunding();

  // MAX mints all xDAI minus a gas reserve (app-stacks gas-reserve-on-MAX).
  const mintableXdai = useMemo(() => {
    if (xdaiBalance === undefined) return undefined;
    return xdaiBalance > GAS_RESERVE_XDAI ? xdaiBalance - GAS_RESERVE_XDAI : 0n;
  }, [xdaiBalance]);

  const parsed = useMemo(() => parseAmount(amount, 18), [amount]);
  const insufficientXdai =
    parsed !== null &&
    parsed > 0n &&
    mintableXdai !== undefined &&
    parsed > mintableXdai;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current
      ?.querySelector<HTMLElement>("input,button")
      ?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Refresh balances (and clear the field) after a successful mint.
  useEffect(() => {
    if (!tx.isSuccess) return;
    refetchBreadBalance();
    refetchXdaiBalance();
    setAmount("");
  }, [tx.isSuccess, refetchBreadBalance, refetchXdaiBalance]);

  if (!open) return null;

  const showOnramp = PRIVY_ENABLED && Boolean(openOnramp);
  const lowXdai = xdaiBalance !== undefined && xdaiBalance < LOW_XDAI;

  const submit = () => {
    if (parsed === null || parsed === 0n || insufficientXdai) return;
    mintBread(parsed);
  };

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      role="presentation"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="border-paper-2 bg-paper-0 relative w-full max-w-md rounded-2xl border p-6 shadow-xl"
      >
        <div id={titleId}>
          <Heading4 className="text-text-standard">Get BREAD</Heading4>
        </div>
        <Body className="text-surface-grey-2 mt-2 text-sm">
          BREAD is the savings token your Safety Net holds. It mints 1:1 from
          xDAI — 1 xDAI becomes 1 BREAD, redeemable back to xDAI anytime.
        </Body>

        <dl className="border-paper-2 bg-paper-main mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border">
          <div className="bg-paper-0 p-3">
            <dt className="text-surface-grey-2 text-xs font-medium">
              Your BREAD
            </dt>
            <dd className="font-breadDisplay text-text-standard mt-0.5 text-lg font-bold">
              {breadBalance !== undefined
                ? formatAmount(breadBalance, 18)
                : "…"}
            </dd>
          </div>
          <div className="bg-paper-0 p-3">
            <dt className="text-surface-grey-2 text-xs font-medium">
              Your xDAI
            </dt>
            <dd className="font-breadDisplay text-text-standard mt-0.5 text-lg font-bold">
              {xdaiBalance !== undefined ? formatAmount(xdaiBalance, 18) : "…"}
            </dd>
          </div>
        </dl>

        {showOnramp && lowXdai && (
          <div className="mt-4">
            <p className="text-surface-grey-2 text-xs font-medium">
              You&apos;ll need xDAI to mint BREAD. Buy some with card or another
              wallet:
            </p>
            <Button
              app="net"
              variant="secondary"
              className="mt-2 w-full"
              onClick={() => openOnramp?.()}
            >
              Buy xDAI
            </Button>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <AmountField
            label="Mint from xDAI"
            value={amount}
            onChange={setAmount}
            balance={mintableXdai}
            balanceLabel="Available"
            symbol="xDAI"
            decimals={18}
            error={insufficientXdai}
            help="1 xDAI = 1 BREAD. A little xDAI is kept back for gas when you use MAX."
          />

          {insufficientXdai && (
            <p className="text-system-red text-xs font-medium">
              That&apos;s more xDAI than you have available
              {mintableXdai !== undefined
                ? ` (${formatAmount(mintableXdai, 18)} xDAI, keeping ${formatUnits(
                    GAS_RESERVE_XDAI,
                    18,
                  )} for gas)`
                : ""}
              .
            </p>
          )}

          <Button
            app="net"
            variant="primary"
            className="w-full"
            isLoading={tx.isBusy}
            onClick={submit}
            {...(parsed === null || parsed === 0n || insufficientXdai
              ? { disabled: true }
              : {})}
          >
            {parsed !== null && parsed > 0n
              ? `Mint ${formatAmount(parsed, 18)} BREAD from xDAI`
              : "Mint BREAD from xDAI"}
          </Button>

          <TxStatus
            status={tx.status}
            hash={tx.hash}
            error={tx.error}
            successLabel="Minted BREAD"
          />

          <Button
            app="net"
            variant="secondary"
            className="w-full"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
