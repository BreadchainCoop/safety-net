"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useAccount } from "wagmi";
import { Body, Button, Caption, Heading4 } from "@breadcoop/ui";
import { AmountField } from "@/components/ui/amount-field";
import { TxStatus } from "@/components/ui/tx-status";
import { PRIVY_ENABLED } from "@/lib/config";
import { formatAmount, parseAmount } from "@/lib/format";
import { GAS_RESERVE_XDAI, useBreadFunding } from "@/hooks/use-bread-funding";
import { useWatchFundedXdai } from "@/hooks/use-watch-funded-xdai";
import { LiFiBridge } from "./lifi-bridge";
import { ReceivePanel } from "./receive-panel";
import { FundWithWallet } from "./fund-with-wallet";
import { PeerOnramp } from "./peer-onramp";

/**
 * RAIL 2 (peer/zkp2p) is gated behind this build-time flag: hidden by default
 * so `@zkp2p/sdk` never loads or errors unless an operator opts in. Config
 * requirements are documented in web/README.md.
 */
const PEER_ONRAMP_ENABLED = process.env.NEXT_PUBLIC_ZKP2P_ENABLED === "true";

type RailId = "bridge" | "wallet" | "onramp" | "peer" | "receive" | "mint";

interface Rail {
  id: RailId;
  label: string;
  heading: string;
  blurb: string;
}

/** "Get BREAD" funding hub — a sectioned set of ways to add funds. */
export function FundHub({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const {
    breadBalance,
    xdaiBalance,
    refetchBreadBalance,
    refetchXdaiBalance,
    mintBread,
    tx,
    openOnramp,
  } = useBreadFunding();

  const showOnramp = PRIVY_ENABLED && Boolean(openOnramp);

  const rails: Rail[] = useMemo(() => {
    const base: Rail[] = [
      {
        id: "bridge",
        label: "Transfer crypto",
        heading: "Bring crypto from any chain",
        blurb:
          "Bridge or swap tokens from Ethereum, Arbitrum, Base and more into xDAI on Gnosis. Best if you already hold crypto elsewhere.",
      },
    ];
    // RAIL 1 — fund the embedded wallet from a linked external injected wallet.
    // Meaningless outside Privy (the connected wallet IS the active account), so
    // gate on PRIVY_ENABLED — the Receive + Mint rails cover that case.
    if (PRIVY_ENABLED) {
      base.push({
        id: "wallet",
        label: "From my wallet",
        heading: "Fund from a connected wallet",
        blurb:
          "Move xDAI (or mint BREAD directly) from a browser wallet like MetaMask or Rabby into your app wallet. Best if you already hold xDAI on Gnosis elsewhere.",
      });
    }
    if (showOnramp) {
      base.push({
        id: "onramp",
        label: "Buy with card",
        heading: "Buy xDAI with card",
        blurb: "Top up your wallet with a card or bank transfer via Privy. Best if you're starting from fiat.",
      });
    }
    // RAIL 2 — peer (zkp2p) fiat onramp; hidden unless explicitly enabled.
    if (PEER_ONRAMP_ENABLED) {
      base.push({
        id: "peer",
        label: "Peer onramp",
        heading: "Buy xDAI peer-to-peer",
        blurb:
          "Buy xDAI from a peer via ZKP2P — no KYC, straight to your wallet on Gnosis. Requires the ZKP2P browser extension.",
      });
    }
    base.push(
      {
        id: "receive",
        label: "Receive",
        heading: "Receive from another wallet",
        blurb: "Send xDAI or BREAD on Gnosis directly to your wallet address. Best if a friend or exchange is paying you.",
      },
      {
        id: "mint",
        label: "Mint BREAD",
        heading: "Mint BREAD from xDAI",
        blurb: "Already holding xDAI? Convert it to BREAD 1:1 — redeemable back to xDAI anytime.",
      },
    );
    return base;
  }, [showOnramp]);
  // PRIVY_ENABLED and PEER_ONRAMP_ENABLED are build-time constants, so the rail
  // set is stable per build — no need to list them as deps.

  const [rail, setRail] = useState<RailId>("bridge");
  const active = rails.find((r) => r.id === rail) ?? rails[0];

  // ---- Direct mint state ----------------------------------------------------
  const [amount, setAmount] = useState("");
  const mintableXdai = useMemo(() => {
    if (xdaiBalance === undefined) return undefined;
    return xdaiBalance > GAS_RESERVE_XDAI ? xdaiBalance - GAS_RESERVE_XDAI : 0n;
  }, [xdaiBalance]);
  const parsed = useMemo(() => parseAmount(amount, 18), [amount]);
  const insufficientXdai =
    parsed !== null && parsed > 0n && mintableXdai !== undefined && parsed > mintableXdai;

  const submitMint = () => {
    if (parsed === null || parsed === 0n || insufficientXdai) return;
    mintBread(parsed);
  };

  // ---- Post-route auto-mint offer ------------------------------------------
  // Watch xDAI while on the bridge/receive/onramp rails; when new xDAI lands,
  // offer to mint it into BREAD (one prompt per arrival). Users on the "mint"
  // rail are already minting manually, so we don't watch there.
  const [pendingMint, setPendingMint] = useState<bigint | null>(null);
  const watchEnabled =
    rail === "bridge" ||
    rail === "receive" ||
    rail === "onramp" ||
    rail === "wallet" ||
    rail === "peer";

  const onFunded = useCallback((delta: bigint) => {
    setPendingMint((cur) => (cur ?? 0n) + delta);
  }, []);
  useWatchFundedXdai(address, onFunded, watchEnabled);

  const acceptPendingMint = () => {
    if (!pendingMint) return;
    // Reserve gas so the mint tx itself can pay for gas.
    const value = pendingMint > GAS_RESERVE_XDAI ? pendingMint - GAS_RESERVE_XDAI : pendingMint;
    setPendingMint(null);
    mintBread(value);
  };

  // Refresh balances (and clear inputs) after a successful action.
  useEffect(() => {
    if (!tx.isSuccess) return;
    refetchBreadBalance();
    refetchXdaiBalance();
    setAmount("");
    setPendingMint(null);
  }, [tx.isSuccess, refetchBreadBalance, refetchXdaiBalance]);

  return (
    <div>
      <Heading4 className="text-text-standard">Add funds</Heading4>
      <Body className="text-surface-grey-2 mt-1 text-sm">
        Fund your wallet, then mint BREAD — the savings token your Safety Net
        holds. BREAD mints 1:1 from xDAI and redeems back anytime.
      </Body>

      {/* Live balances */}
      <dl className="border-paper-2 bg-paper-main mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border">
        <div className="bg-paper-0 p-3">
          <dt className="text-surface-grey-2 text-xs font-medium">Your BREAD</dt>
          <dd className="font-breadDisplay text-text-standard mt-0.5 text-lg font-bold">
            {breadBalance !== undefined ? formatAmount(breadBalance, 18) : "…"}
          </dd>
        </div>
        <div className="bg-paper-0 p-3">
          <dt className="text-surface-grey-2 text-xs font-medium">Your xDAI</dt>
          <dd className="font-breadDisplay text-text-standard mt-0.5 text-lg font-bold">
            {xdaiBalance !== undefined ? formatAmount(xdaiBalance, 18) : "…"}
          </dd>
        </div>
      </dl>

      {/* Auto-mint offer after funds land */}
      {pendingMint !== null && pendingMint > 0n && rail !== "mint" && (
        <div className="border-primary-jade bg-paper-main mt-4 rounded-xl border p-3">
          <p className="text-text-standard text-sm font-medium">
            {formatAmount(pendingMint, 18)} xDAI just arrived. Mint it into BREAD?
          </p>
          <div className="mt-2 flex gap-2">
            <Button app="net" variant="primary" className="flex-1" isLoading={tx.isBusy} onClick={acceptPendingMint}>
              Mint BREAD
            </Button>
            <Button app="net" variant="secondary" onClick={() => setPendingMint(null)}>
              Keep xDAI
            </Button>
          </div>
          <TxStatus status={tx.status} hash={tx.hash} error={tx.error} successLabel="Minted BREAD" />
        </div>
      )}

      {/* Rail tabs */}
      <div role="tablist" aria-label="Funding methods" className="mt-4 flex flex-wrap gap-2">
        {rails.map((r) => (
          <button
            key={r.id}
            role="tab"
            type="button"
            aria-selected={r.id === rail}
            aria-controls={`fund-panel-${r.id}`}
            id={`fund-tab-${r.id}`}
            onClick={() => setRail(r.id)}
            className={
              r.id === rail
                ? "bg-primary-jade rounded-full px-3 py-1.5 text-sm font-medium text-white"
                : "border-paper-2 text-surface-grey-2 hover:border-primary-jade rounded-full border px-3 py-1.5 text-sm font-medium"
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`fund-panel-${active.id}`}
        aria-labelledby={`fund-tab-${active.id}`}
        className="mt-4"
      >
        <Heading4 className="text-text-standard text-base">{active.heading}</Heading4>
        <Caption className="text-surface-grey mt-1 block">{active.blurb}</Caption>

        <div className="mt-3">
          {rail === "bridge" && (
            <LiFiBridge address={address as Address | undefined} onXdaiRouted={() => refetchXdaiBalance()} />
          )}

          {rail === "wallet" && PRIVY_ENABLED && (
            <FundWithWallet
              embeddedAddress={address as Address | undefined}
              onFunded={() => refetchXdaiBalance()}
            />
          )}

          {rail === "peer" && PEER_ONRAMP_ENABLED && (
            <PeerOnramp address={address as Address | undefined} />
          )}

          {rail === "onramp" && showOnramp && (
            <Button app="net" variant="secondary" className="w-full" onClick={() => openOnramp?.()}>
              Buy xDAI with card
            </Button>
          )}

          {rail === "receive" && <ReceivePanel address={address as Address | undefined} />}

          {rail === "mint" && (
            <div className="flex flex-col gap-3">
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
                    ? ` (${formatAmount(mintableXdai, 18)} xDAI, keeping ${formatUnits(GAS_RESERVE_XDAI, 18)} for gas)`
                    : ""}
                  .
                </p>
              )}
              <Button
                app="net"
                variant="primary"
                className="w-full"
                isLoading={tx.isBusy}
                onClick={submitMint}
                {...(parsed === null || parsed === 0n || insufficientXdai ? { disabled: true } : {})}
              >
                {parsed !== null && parsed > 0n
                  ? `Mint ${formatAmount(parsed, 18)} BREAD from xDAI`
                  : "Mint BREAD from xDAI"}
              </Button>
              <TxStatus status={tx.status} hash={tx.hash} error={tx.error} successLabel="Minted BREAD" />
            </div>
          )}
        </div>
      </div>

      <Button app="net" variant="secondary" className="mt-4 w-full" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
