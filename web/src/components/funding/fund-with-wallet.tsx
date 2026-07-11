"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  formatUnits,
  type Address,
  type WalletClient,
} from "viem";
import { usePrivy, type WalletWithMetadata } from "@privy-io/react-auth";
import { usePublicClient } from "wagmi";
import { Body, Button } from "@breadcoop/ui";
import { AmountField } from "@/components/ui/amount-field";
import { AddressDisplay } from "@/components/ui/address-display";
import { BREAD_ADDRESS, CHAIN, CHAIN_ID } from "@/lib/config";
import { breadAbi } from "@/lib/abi/bread";
import { formatAmount, parseAmount } from "@/lib/format";
import { GAS_RESERVE_XDAI } from "@/hooks/use-bread-funding";

type Phase = "idle" | "signing" | "confirming" | "success" | "error";

/**
 * RAIL 1 — Fund the embedded (Privy) wallet from a separately-connected
 * INJECTED external wallet (MetaMask / Rabby / …).
 *
 * Ports app-stacks `fund-with-connected-wallet{,-modal-amount}.tsx`: when the
 * active account is a Privy EMBEDDED wallet, the user funds it from an injected
 * browser wallet they've linked. Two actions on the external wallet:
 *   (a) "Send xDAI" — plain native transfer to the embedded address, or
 *   (b) "Mint BREAD" — call BREAD `mint(embeddedAddress){ value }` so BREAD
 *       lands straight in the embedded wallet.
 *
 * This component uses Privy hooks unconditionally, so it must ONLY be rendered
 * when `PRIVY_ENABLED` (fund-hub gates it). In non-Privy mode the connected
 * wallet *is* the active account, so "fund from connected wallet" would be a
 * self-transfer — the Receive + Mint rails already cover that, and this rail is
 * hidden.
 *
 * Sends go through a viem walletClient over `window.ethereum`
 * (sendTransaction / writeContract with value) rather than the app's shared
 * `useTx` (which is bound to the embedded/sponsored signer, not the external
 * wallet). Balances refresh via the caller's `onFunded` after xDAI lands.
 */
export function FundWithWallet({
  embeddedAddress,
  onFunded,
}: {
  /** The current active account — the embedded wallet being funded. */
  embeddedAddress?: Address;
  /** Called after a successful send so the hub can refresh balances. */
  onFunded: () => void;
}) {
  const { user, linkWallet, ready } = usePrivy();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });

  // The user's injected external wallet as tracked by Privy linked accounts
  // (app-stacks pattern: type === "wallet" && connectorType === "injected").
  const injected = useMemo(
    () =>
      user?.linkedAccounts.find(
        (a): a is WalletWithMetadata =>
          a.type === "wallet" && a.connectorType === "injected",
      ),
    [user?.linkedAccounts],
  );
  const externalAddress = injected?.address as Address | undefined;
  const walletLabel = injected?.walletClientType ?? "wallet";

  const [externalBalance, setExternalBalance] = useState<bigint | undefined>();
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | undefined>();

  // Read the external wallet's native xDAI balance on Gnosis.
  const refreshExternalBalance = useCallback(async () => {
    if (!externalAddress || !publicClient) return;
    try {
      const bal = await publicClient.getBalance({ address: externalAddress });
      setExternalBalance(bal);
    } catch {
      // Non-fatal — leave the balance unknown.
    }
  }, [externalAddress, publicClient]);

  useEffect(() => {
    void refreshExternalBalance();
  }, [refreshExternalBalance]);

  const spendable = useMemo(() => {
    if (externalBalance === undefined) return undefined;
    return externalBalance > GAS_RESERVE_XDAI
      ? externalBalance - GAS_RESERVE_XDAI
      : 0n;
  }, [externalBalance]);

  const parsed = useMemo(() => parseAmount(amount, 18), [amount]);
  const insufficient =
    parsed !== null && parsed > 0n && spendable !== undefined && parsed > spendable;
  const invalidAmount = parsed === null || parsed === 0n || insufficient;
  const busy = phase === "signing" || phase === "confirming";

  // Build a viem walletClient over the injected provider, pinned to Gnosis.
  const getWalletClient = useCallback(async (): Promise<{
    client: WalletClient;
    account: Address;
  }> => {
    const ethereum = (globalThis as { ethereum?: unknown }).ethereum;
    if (!ethereum) throw new Error("No injected wallet detected in this browser.");
    const client = createWalletClient({
      chain: CHAIN,
      transport: custom(ethereum as Parameters<typeof custom>[0]),
    });
    const [account] = await client.requestAddresses();
    if (!account) throw new Error("No account authorized in the external wallet.");
    const currentChain = await client.getChainId();
    if (currentChain !== CHAIN_ID) {
      await client.switchChain({ id: CHAIN_ID });
    }
    return { client, account };
  }, []);

  const runSend = useCallback(
    async (kind: "send" | "mint") => {
      if (!embeddedAddress || invalidAmount || parsed === null) return;
      setError(null);
      setHash(undefined);
      setPhase("signing");
      try {
        const { client, account } = await getWalletClient();
        let txHash: `0x${string}`;
        if (kind === "send") {
          txHash = await client.sendTransaction({
            account,
            chain: CHAIN,
            to: embeddedAddress,
            value: parsed,
          });
        } else {
          txHash = await client.sendTransaction({
            account,
            chain: CHAIN,
            to: BREAD_ADDRESS,
            value: parsed,
            data: encodeFunctionData({
              abi: breadAbi,
              functionName: "mint",
              args: [embeddedAddress],
            }),
          });
        }
        setHash(txHash);
        setPhase("confirming");
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: txHash });
        }
        setPhase("success");
        setAmount("");
        void refreshExternalBalance();
        onFunded();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transaction failed");
        setPhase("error");
      }
    },
    [
      embeddedAddress,
      invalidAmount,
      parsed,
      getWalletClient,
      publicClient,
      refreshExternalBalance,
      onFunded,
    ],
  );

  if (!ready) {
    return <p className="text-surface-grey-2 text-sm">Loading wallet…</p>;
  }

  // No injected wallet linked yet — prompt to connect one.
  if (!externalAddress) {
    return (
      <div className="border-paper-2 bg-paper-main rounded-xl border p-4">
        <Body className="text-surface-grey-2 text-sm">
          Connect a browser wallet (MetaMask, Rabby, …) that already holds xDAI
          on Gnosis, then move funds into your app wallet in one click.
        </Body>
        <Button
          app="net"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => linkWallet()}
        >
          Connect a wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border-paper-2 bg-paper-main rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-surface-grey-2 text-xs font-medium capitalize">
            {walletLabel} (external)
          </span>
          <AddressDisplay address={externalAddress} chars={4} />
        </div>
        <p className="text-surface-grey mt-1 text-xs">
          Balance:{" "}
          {externalBalance !== undefined
            ? `${formatAmount(externalBalance, 18)} xDAI`
            : "…"}
        </p>
      </div>

      <AmountField
        label="Amount to move"
        value={amount}
        onChange={setAmount}
        balance={spendable}
        balanceLabel="Spendable"
        symbol="xDAI"
        decimals={18}
        error={insufficient}
        help={`Sent from your external wallet to your app wallet. A little xDAI is kept back for gas when you use MAX (${formatUnits(GAS_RESERVE_XDAI, 18)} xDAI).`}
      />

      {insufficient && (
        <p className="text-system-red text-xs font-medium">
          That&apos;s more xDAI than the external wallet has spendable
          {spendable !== undefined
            ? ` (${formatAmount(spendable, 18)} xDAI, keeping ${formatUnits(GAS_RESERVE_XDAI, 18)} for gas)`
            : ""}
          .
        </p>
      )}

      <div className="flex gap-2">
        <Button
          app="net"
          variant="secondary"
          className="flex-1"
          isLoading={busy}
          onClick={() => runSend("send")}
          {...(invalidAmount ? { disabled: true } : {})}
        >
          Send xDAI
        </Button>
        <Button
          app="net"
          variant="primary"
          className="flex-1"
          isLoading={busy}
          onClick={() => runSend("mint")}
          {...(invalidAmount ? { disabled: true } : {})}
        >
          Mint BREAD
        </Button>
      </div>

      <div role="status" aria-live="polite">
        {phase === "error" && (
          <p className="text-system-red text-sm font-medium">
            {error ?? "Transaction failed"}
          </p>
        )}
        {phase === "success" && (
          <p className="text-system-green text-sm font-medium">
            Sent from your external wallet.
          </p>
        )}
        {busy && (
          <p className="text-surface-grey-2 text-sm font-medium">
            {phase === "signing"
              ? "Confirm in your external wallet…"
              : "Waiting for confirmation…"}
          </p>
        )}
        {hash && phase !== "signing" && (
          <p className="text-surface-grey mt-1 text-xs">Tx submitted.</p>
        )}
      </div>
    </div>
  );
}
