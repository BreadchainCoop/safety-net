"use client";

import { useState } from "react";
import { LiftedButton, Body, Caption, Heading4 } from "@breadcoop/ui";
import { useConnectedUser } from "@breadcoop/ui";
import { useReadContracts } from "wagmi";
import { safetyNetAbi } from "@/lib/abis/safety-net";
import { SAFETY_NET_ADDRESS } from "@/lib/constants";
import { getDefaultChainId } from "@/utils/chain";
import { buildInviteTypedData, buildInviteUrl } from "@/lib/invite";
import { useWallets } from "@privy-io/react-auth";
import { Address } from "viem";

interface InviteManagerProps {
  fundId: bigint;
  fundOwner: string;
}

interface GeneratedInvite {
  nonce: bigint;
  signature: string;
  url: string;
  used: boolean;
}

export function InviteManager({ fundId, fundOwner }: InviteManagerProps) {
  const { user } = useConnectedUser();
  const { wallets } = useWallets();
  const chainId = getDefaultChainId();
  const [inviteCount, setInviteCount] = useState(1);
  const [invites, setInvites] = useState<GeneratedInvite[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const isOwner =
    user.status === "CONNECTED" &&
    user.address.toLowerCase() === fundOwner.toLowerCase();

  // Check used nonces for existing invites
  const nonceContracts = invites.map((inv) => ({
    address: SAFETY_NET_ADDRESS,
    abi: safetyNetAbi,
    functionName: "usedNonces" as const,
    args: [fundId, inv.nonce] as const,
    chainId,
  }));

  const { data: nonceResults } = useReadContracts({
    contracts: nonceContracts,
    query: { enabled: nonceContracts.length > 0 },
  });

  const handleGenerate = async () => {
    if (!isOwner) return;
    setIsGenerating(true);

    try {
      const wallet = wallets[0];
      if (!wallet) throw new Error("No wallet connected");

      const provider = await wallet.getEthereumProvider();
      const newInvites: GeneratedInvite[] = [];

      for (let i = 0; i < inviteCount; i++) {
        const nonce = BigInt(Date.now()) + BigInt(i);
        const typedData = buildInviteTypedData(
          fundId,
          nonce,
          chainId,
          SAFETY_NET_ADDRESS
        );

        const signature = await provider.request({
          method: "eth_signTypedData_v4",
          params: [
            user.address as Address,
            JSON.stringify({
              types: {
                EIP712Domain: [
                  { name: "name", type: "string" },
                  { name: "version", type: "string" },
                  { name: "chainId", type: "uint256" },
                  { name: "verifyingContract", type: "address" },
                ],
                ...typedData.types,
              },
              primaryType: typedData.primaryType,
              domain: typedData.domain,
              message: {
                safetyNetId: nonce > 0n ? fundId.toString() : fundId.toString(),
                nonce: nonce.toString(),
              },
            }),
          ],
        });

        const url = buildInviteUrl(
          window.location.origin,
          SAFETY_NET_ADDRESS,
          fundId,
          nonce,
          signature as string
        );

        newInvites.push({
          nonce,
          signature: signature as string,
          url,
          used: false,
        });
      }

      setInvites((prev) => [...prev, ...newInvites]);
    } catch (e) {
      console.error("Failed to generate invites:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  if (!isOwner) return null;

  return (
    <div className="space-y-4">
      <Heading4>Invite Members</Heading4>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-sm font-medium text-gray-700">
            Number of invites
          </label>
          <input
            type="number"
            value={inviteCount}
            onChange={(e) => setInviteCount(Number(e.target.value))}
            min={1}
            max={20}
            className="input-field"
          />
        </div>
        <LiftedButton onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? "Signing..." : "Generate Invites"}
        </LiftedButton>
      </div>

      {invites.length > 0 && (
        <div className="space-y-2">
          {invites.map((invite, idx) => {
            const isUsed =
              nonceResults?.[idx]?.status === "success" &&
              nonceResults[idx].result === true;
            return (
              <div
                key={invite.nonce.toString()}
                className="flex items-center gap-2 p-3 bg-paper-1 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <Caption>
                    Nonce: {invite.nonce.toString().slice(-6)}
                  </Caption>
                  <Body className="truncate text-sm">{invite.url}</Body>
                </div>
                {isUsed ? (
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                    Used
                  </span>
                ) : (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => copyToClipboard(invite.url, idx)}
                      className="text-sm px-3 py-1 bg-primary-orange text-white rounded transition-all"
                    >
                      {copiedIdx === idx ? "Copied!" : "Copy"}
                    </button>
                    {typeof navigator !== "undefined" && navigator.share && (
                      <button
                        onClick={() =>
                          navigator.share({
                            title: "Safety Net Invite",
                            text: "Join my mutual aid fund on Safety Net",
                            url: invite.url,
                          })
                        }
                        className="text-sm px-3 py-1 bg-paper-1 rounded hover:bg-paper-2 transition-colors"
                      >
                        Share
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
