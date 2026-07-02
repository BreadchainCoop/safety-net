import type { Metadata } from "next";
import { JoinContent } from "@/components/join/join-content";
import { buildMetadata } from "@/lib/metadata";

// Server wrapper so shared invite links unfurl into a rich card (app-stacks
// join-page pattern); all interactivity lives in the client JoinContent.
export const metadata: Metadata = buildMetadata({
  title: "Join a Safety Net",
  description:
    "You've been invited to a Safety Net — a group savings pool with recurring deposits and community-approved withdrawals on Gnosis Chain. Redeem your invite to join.",
  path: "/join/",
});

export default function JoinPage() {
  return <JoinContent />;
}
