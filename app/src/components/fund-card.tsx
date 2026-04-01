"use client";

import Link from "next/link";
import { Body, Heading4, Caption } from "@breadcoop/ui";
import { formatBalance, formatEpochDuration, truncateAddress } from "@/utils/format";
import { StatusBadge } from "./status-badge";
import { FundStatus } from "@/lib/get-fund-status";
import { useDisplayName } from "@/hooks/use-ens-name";

interface FundCardProps {
  id: bigint;
  owner: string;
  token: string;
  memberCount: number;
  balance: bigint;
  epochDuration: bigint;
  status: FundStatus;
  duesRemaining: bigint;
}

export function FundCard({
  id,
  owner,
  token,
  memberCount,
  balance,
  epochDuration,
  status,
  duesRemaining,
}: FundCardProps) {
  const { displayName: ownerName } = useDisplayName(owner);
  return (
    <Link href={`/fund/${id.toString()}`}>
      <div className="card-shadow-border rounded-xl p-5 hover:shadow-lg transition-shadow cursor-pointer">
        <div className="flex items-center justify-between mb-3">
          <Heading4>Fund #{id.toString()}</Heading4>
          <StatusBadge status={status} />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Caption>Owner</Caption>
            <Body>{ownerName}</Body>
          </div>
          <div className="flex justify-between">
            <Caption>Token</Caption>
            <Body>{truncateAddress(token)}</Body>
          </div>
          <div className="flex justify-between">
            <Caption>Members</Caption>
            <Body>{memberCount}</Body>
          </div>
          <div className="flex justify-between">
            <Caption>Your Balance</Caption>
            <Body>{formatBalance(balance)}</Body>
          </div>
          <div className="flex justify-between">
            <Caption>Epoch</Caption>
            <Body>{formatEpochDuration(epochDuration)}</Body>
          </div>
          {duesRemaining > 0n && (
            <div className="flex justify-between text-amber-600">
              <Caption>Dues Remaining</Caption>
              <Body>{formatBalance(duesRemaining)}</Body>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
