"use client";

import { useAccount } from "wagmi";
import { Caption } from "@breadcoop/ui";
import { AddressDisplay } from "@/components/ui/address-display";
import { Badge, Card } from "@/components/ui/ui";
import {
  useMemberBalances,
  useMembersNeedingDeposit,
} from "@/hooks/use-safety-net";
import { useTokenInfo } from "@/hooks/use-token";
import { formatAmount } from "@/lib/format";
import type { SafetyNetDetails } from "@/lib/types";

/** Members with their withdrawable balances and dues status. */
export function MembersList({ details }: { details: SafetyNetDetails }) {
  const { address } = useAccount();
  const net = details.safetyNet;
  const { data: balances } = useMemberBalances(net.id);
  const { data: needingDeposit } = useMembersNeedingDeposit(net.id);
  const { symbol, decimals } = useTokenInfo(net.token);

  const owes = new Set(
    (needingDeposit ?? []).map((m: string) => m.toLowerCase()),
  );
  const [members, memberBalances] = balances ?? [net.members, undefined];

  return (
    <Card>
      <Caption className="text-surface-grey-2">
        Members ({details.memberCount.toString()})
      </Caption>
      <ul className="mt-2">
        {members.map((member, i) => (
          <li
            key={member}
            className="border-paper-2 flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0"
          >
            <span className="flex items-center gap-2">
              <AddressDisplay address={member} />
              {member.toLowerCase() === address?.toLowerCase() && (
                <Badge tone="jade">you</Badge>
              )}
              {member.toLowerCase() === net.owner.toLowerCase() && (
                <Badge tone="grey">owner</Badge>
              )}
              {owes.has(member.toLowerCase()) && (
                <Badge tone="warning">dues due</Badge>
              )}
            </span>
            <span className="text-text-standard text-sm font-medium">
              {memberBalances
                ? `${formatAmount(memberBalances[i], decimals)} ${symbol}`
                : "…"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
