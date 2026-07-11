"use client";

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zeroAddress } from "viem";
import { Button } from "@breadcoop/ui";
import { ArrowRight } from "@phosphor-icons/react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/ui/ui";
import { NetStatusBadges } from "@/components/net/net-card";
import { NetOverview } from "@/components/net/net-overview";
import { MembersList } from "@/components/net/members-list";
import { DepositPanel } from "@/components/net/deposit-panel";
import { WithdrawPanel } from "@/components/net/withdraw-panel";
import { RequestsList } from "@/components/net/requests-list";
import { InvitePanel } from "@/components/net/invite-panel";
import { StartNetBanner } from "@/components/net/start-panel";
import { DecommissionPanel } from "@/components/net/decommission-panel";
import { DepositReminder } from "@/components/net/deposit-reminder";
import { AutoDepositToggle } from "@/components/net/auto-deposit-toggle";
import { ActivityFeed } from "@/components/net/activity-feed";
import { useSafetyNetDetails, useSafetyNetName } from "@/hooks/use-safety-net";
import { isContractConfigured } from "@/lib/config";
import { parseContractError } from "@/lib/parse-contract-error";

/**
 * Net detail. The id comes from the query string (/net/?id=1) because the
 * app is a pure static export — dynamic path segments would need
 * generateStaticParams for ids that don't exist at build time.
 */
function NetDetail() {
  const params = useSearchParams();
  const rawId = params.get("id");

  const id = useMemo(() => {
    if (rawId === null) return undefined;
    try {
      return BigInt(rawId);
    } catch {
      return undefined;
    }
  }, [rawId]);

  const { data: details, isLoading, error, refetch } = useSafetyNetDetails(id);
  const { data: name } = useSafetyNetName(id);

  // Static export builds a single generic <title> for /net; reflect the net's
  // name (or id) in the document title client-side once it's known.
  useEffect(() => {
    if (id === undefined) return;
    document.title = `${name || `Safety Net #${id.toString()}`} · Safety Net`;
  }, [id, name]);

  if (!isContractConfigured)
    return (
      <EmptyState>
        The SafetyNet contract address isn&apos;t configured yet — nothing to
        show. See the banner above.
      </EmptyState>
    );

  if (id === undefined)
    return (
      <ErrorState>
        Missing or invalid Safety Net id — open a net from{" "}
        <Link href="/" className="underline">
          your dashboard
        </Link>
        .
      </ErrorState>
    );

  if (isLoading || (!details && !error))
    return <LoadingState label={`Loading Safety Net #${id.toString()}…`} />;

  if (error)
    return (
      <ErrorState>
        Couldn&apos;t load this Safety Net: {parseContractError(error)}{" "}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </ErrorState>
    );

  if (!details || details.safetyNet.owner === zeroAddress)
    return (
      <EmptyState>
        Safety Net #{id.toString()} doesn&apos;t exist or has been wound down.
      </EmptyState>
    );

  // safetyNetStart == 0 means "pending": members join by invite until the
  // owner calls start(). Deposits/withdrawals/requests would all revert, so
  // the pending layout swaps them for an inert notice and puts the invite
  // panel front-and-center instead.
  const pending = details.safetyNet.safetyNetStart === 0n;

  return (
    <>
      <PageHeader
        title={name || `Safety Net #${id.toString()}`}
        subtitle={name ? `Safety Net #${id.toString()}` : undefined}
        actions={<NetStatusBadges details={details} />}
      />

      {pending ? (
        <>
          <StartNetBanner details={details} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <InvitePanel details={details} />
              <MembersList details={details} />
              <NetOverview details={details} />
              <ActivityFeed details={details} />
            </div>

            <div className="flex flex-col gap-4">
              {details.isMember ? (
                <EmptyState>
                  You&apos;re in. Once{" "}
                  {details.safetyNet.minimumMembers.toString()} members have
                  joined, the owner starts the net and epoch 1 begins —
                  deposits, support, and requests all open then.
                </EmptyState>
              ) : (
                <div className="flex flex-col gap-3">
                  <EmptyState>
                    You&apos;re not a member of this Safety Net. Ask the owner
                    for an invite link to join before it starts.
                  </EmptyState>
                  <Button
                    as={Link}
                    app="net"
                    variant="secondary"
                    rightIcon={<ArrowRight />}
                    href="/how"
                  >
                    See how it works
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* On phones the single column stacks top-to-bottom; a member's
              Deposit/Withdraw actions (right) come first so they aren't buried
              under overview/members/requests. Reverts to the sidebar on lg. */}
          <div
            className={`flex flex-col gap-4 lg:col-span-2 ${
              details.isMember ? "order-2 lg:order-1" : ""
            }`}
          >
            <NetOverview details={details} />
            <MembersList details={details} />
            <RequestsList details={details} />
            <ActivityFeed details={details} />
          </div>

          <div
            className={`flex flex-col gap-4 ${
              details.isMember ? "order-1 lg:order-2" : ""
            }`}
          >
            {details.isMember ? (
              <>
                <DepositPanel details={details} />
                <DepositReminder details={details} />
                <AutoDepositToggle details={details} />
                <WithdrawPanel details={details} />
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <EmptyState>
                  You&apos;re not a member of this Safety Net — it has already
                  started, so joining is closed.
                </EmptyState>
                <Button
                  as={Link}
                  app="net"
                  variant="secondary"
                  rightIcon={<ArrowRight />}
                  href="/how"
                >
                  How Safety Nets work
                </Button>
              </div>
            )}
            <DecommissionPanel details={details} />
          </div>
        </div>
      )}
    </>
  );
}

/** Client body of /net — the page itself is a server wrapper with metadata. */
export function NetPageContent() {
  return (
    <Suspense fallback={<LoadingState label="Loading Safety Net…" />}>
      <NetDetail />
    </Suspense>
  );
}
