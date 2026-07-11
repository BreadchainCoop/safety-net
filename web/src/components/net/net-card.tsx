"use client";

import Link from "next/link";
import { zeroAddress } from "viem";
import { Body, Caption, Heading4 } from "@breadcoop/ui";
import { ArrowRight, UsersThree } from "@phosphor-icons/react";
import { Badge, Card } from "@/components/ui/ui";
import { useTokenInfo } from "@/hooks/use-token";
import { formatAmount } from "@/lib/format";
import type { SafetyNetDetails } from "@/lib/types";

/** Status badges shared by the dashboard card and the net detail header. */
export function NetStatusBadges({ details }: { details: SafetyNetDetails }) {
  const net = details.safetyNet;

  if (net.owner === zeroAddress) {
    return <Badge tone="grey">Wound down</Badge>;
  }

  // safetyNetStart stays 0 until the owner calls start().
  const pending = net.safetyNetStart === 0n;

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {pending ? (
        <Badge tone="jade">Not started</Badge>
      ) : (
        <Badge tone="green">Active</Badge>
      )}
      {details.isDecommissionable && (
        <Badge tone="warning">Decommissionable</Badge>
      )}
      {!pending && details.isMember && details.duesRemaining > 0n && (
        <Badge tone="red">Dues due</Badge>
      )}
    </span>
  );
}

/** Title block: the name (or "Safety Net #N") with "#N" kept as a subtitle. */
function NetCardTitle({ id, name }: { id: bigint; name?: string }) {
  return (
    <div className="min-w-0">
      <Heading4 className="text-text-standard truncate">
        {name || `Safety Net #${id.toString()}`}
      </Heading4>
      {name && (
        <Caption className="text-surface-grey">#{id.toString()}</Caption>
      )}
    </div>
  );
}

/** Dashboard card for one Safety Net the user belongs to. */
export function NetCard({
  details,
  name,
}: {
  details: SafetyNetDetails;
  name?: string;
}) {
  const net = details.safetyNet;
  const pending = net.safetyNetStart === 0n;
  const { symbol, decimals } = useTokenInfo(
    net.owner === zeroAddress ? undefined : net.token,
  );

  if (net.owner === zeroAddress) {
    return (
      <Card className="opacity-70">
        <div className="flex items-center justify-between gap-3">
          <NetCardTitle id={net.id} name={name} />
          <NetStatusBadges details={details} />
        </div>
        <Body className="text-surface-grey-2 mt-2">
          This Safety Net has been wound down and its funds returned to members.
        </Body>
      </Card>
    );
  }

  return (
    <Link href={`/net/?id=${net.id}`} className="group block">
      <Card className="hover:border-primary-jade/50 transition-colors">
        <div className="flex items-center justify-between gap-3">
          <NetCardTitle id={net.id} name={name} />
          <NetStatusBadges details={details} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <div>
            <Caption className="text-surface-grey-2">My balance</Caption>
            <p className="text-text-standard font-breadDisplay mt-0.5 font-bold">
              {formatAmount(details.withdrawableBalance, decimals)} {symbol}
            </p>
          </div>
          <div>
            <Caption className="text-surface-grey-2">Pool</Caption>
            <p className="text-text-standard font-breadDisplay mt-0.5 font-bold">
              {formatAmount(details.totalBalance, decimals)} {symbol}
            </p>
          </div>
          <div>
            <Caption className="text-surface-grey-2">
              {pending ? "Seats filled" : "Members"}
            </Caption>
            <p className="text-text-standard font-breadDisplay mt-0.5 inline-flex items-center gap-1 font-bold">
              <UsersThree size={16} /> {details.memberCount.toString()}
              {pending && ` of ${net.maximumMembers.toString()}`}
            </p>
          </div>
          {pending ? (
            <div>
              <Caption className="text-surface-grey-2">Dues</Caption>
              <p className="text-surface-grey-2 font-breadDisplay mt-0.5 font-bold">
                Not started
              </p>
            </div>
          ) : (
            <div>
              <Caption className="text-surface-grey-2">
                Dues (epoch {details.currentEpochIndex.toString()})
              </Caption>
              <p
                className={`font-breadDisplay mt-0.5 font-bold ${
                  details.duesRemaining > 0n
                    ? "text-system-warning"
                    : "text-system-green"
                }`}
              >
                {details.duesRemaining > 0n
                  ? `${formatAmount(details.duesRemaining, decimals)} ${symbol} left`
                  : "Paid"}
              </p>
            </div>
          )}
        </div>

        <div className="text-primary-jade mt-4 inline-flex items-center gap-1 text-sm font-bold">
          Open{" "}
          <ArrowRight
            size={14}
            weight="bold"
            className="transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </Card>
    </Link>
  );
}
