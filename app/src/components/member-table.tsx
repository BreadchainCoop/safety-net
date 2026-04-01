"use client";

import { Body, Caption } from "@breadcoop/ui";
import { formatBalance } from "@/utils/format";
import { useDisplayName } from "@/hooks/use-ens-name";

interface MemberTableProps {
  members: string[];
  balances: bigint[];
  duesRemaining: Map<string, bigint>;
  currentUserAddress?: string;
}

function MemberName({ address, isCurrentUser }: { address: string; isCurrentUser: boolean }) {
  const { displayName } = useDisplayName(address);
  return (
    <Body>
      {displayName}
      {isCurrentUser && (
        <span className="ml-1 text-xs text-primary-orange">
          (you)
        </span>
      )}
    </Body>
  );
}

export function MemberTable({
  members,
  balances,
  duesRemaining,
  currentUserAddress,
}: MemberTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-paper-1">
            <th className="py-2 pr-4">
              <Caption>Member</Caption>
            </th>
            <th className="py-2 pr-4">
              <Caption>Balance</Caption>
            </th>
            <th className="py-2">
              <Caption>Dues</Caption>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member, i) => {
            const isCurrentUser =
              currentUserAddress?.toLowerCase() === member.toLowerCase();
            const dues = duesRemaining.get(member.toLowerCase()) ?? 0n;
            return (
              <tr
                key={member}
                className={`border-b border-paper-1 ${isCurrentUser ? "bg-paper-1/50" : ""}`}
              >
                <td className="py-2 pr-4">
                  <MemberName address={member} isCurrentUser={isCurrentUser} />
                </td>
                <td className="py-2 pr-4">
                  <Body>{formatBalance(balances[i] ?? 0n)}</Body>
                </td>
                <td className="py-2">
                  {dues > 0n ? (
                    <Body className="text-amber-600">
                      {formatBalance(dues)}
                    </Body>
                  ) : (
                    <Body className="text-green-600">Paid</Body>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
