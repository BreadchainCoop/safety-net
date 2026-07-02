"use client";

import Link from "next/link";
import { Button } from "@breadcoop/ui";
import { Plus } from "@phosphor-icons/react";
import { ConnectGate } from "@/components/ui/connect-gate";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/ui/ui";
import { NetCard } from "@/components/net/net-card";
import { useMemberDashboard } from "@/hooks/use-safety-net";
import { isContractConfigured } from "@/lib/config";
import { parseContractError } from "@/lib/parse-contract-error";

function Dashboard() {
  const { data: dashboard, isLoading, error, refetch } = useMemberDashboard();

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
        <NetCard key={`${details.safetyNet.id}-${i}`} details={details} />
      ))}
    </div>
  );
}

export default function HomePage() {
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
