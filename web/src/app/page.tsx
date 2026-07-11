"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Button } from "@breadcoop/ui";
import { Plus } from "@phosphor-icons/react";
import { ConnectGate } from "@/components/ui/connect-gate";
import { Landing } from "@/components/landing";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/ui/ui";
import { NetCard } from "@/components/net/net-card";
import { useMemberDashboard, useSafetyNetNames } from "@/hooks/use-safety-net";
import { isContractConfigured } from "@/lib/config";
import { parseContractError } from "@/lib/parse-contract-error";

function Dashboard() {
  const { data: dashboard, isLoading, error, refetch } = useMemberDashboard();

  const ids = useMemo(
    () => (dashboard ?? []).map((d) => d.safetyNet.id),
    [dashboard],
  );
  const names = useSafetyNetNames(ids);

  if (!isContractConfigured)
    return (
      <EmptyState>
        The SafetyNet contract address isn&apos;t configured yet — your nets
        will appear here once it is. See the banner above.
      </EmptyState>
    );

  if (isLoading) return <LoadingState label="Loading your Safety Nets…" />;

  if (error)
    return (
      <ErrorState>
        Couldn&apos;t load your Safety Nets: {parseContractError(error)}{" "}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </ErrorState>
    );

  if (!dashboard || dashboard.length === 0)
    return (
      <EmptyState>
        You&apos;re not part of any Safety Net yet.{" "}
        <Link href="/create" className="text-primary-jade font-bold underline">
          Create one
        </Link>{" "}
        or ask a friend for an invite link.
      </EmptyState>
    );

  return (
    <div className="flex flex-col gap-4">
      {dashboard.map((details, i) => (
        <NetCard
          key={`${details.safetyNet.id}-${i}`}
          details={details}
          name={names.get(details.safetyNet.id)}
        />
      ))}
    </div>
  );
}

export default function HomePage() {
  const { isConnected } = useAccount();
  // The static export prerenders the disconnected state; render the same
  // (landing) on the first client pass to avoid a hydration mismatch, then
  // switch to the dashboard once the wallet reconnects.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !isConnected) return <Landing />;

  return (
    <>
      <PageHeader
        title="My Safety Nets"
        subtitle="Pooled savings with people you trust — recurring deposits, group-approved withdrawals."
        actions={
          <Link href="/create">
            <Button app="net" variant="primary" leftIcon={<Plus />}>
              Create Safety Net
            </Button>
          </Link>
        }
      />
      <ConnectGate>
        <Dashboard />
      </ConnectGate>
    </>
  );
}
