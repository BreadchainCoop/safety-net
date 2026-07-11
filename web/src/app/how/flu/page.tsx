import type { Metadata } from "next";
import { FluClaims } from "@/components/explainer/flu-claims";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Flu claims with ZK Email",
  description:
    "How a Safety Net member settles a flu claim instantly by proving a diagnosis email from an approved healthcare provider with zero-knowledge cryptography — no vote, and the email never leaves their device.",
  path: "/how/flu/",
});

export default function FluClaimsPage() {
  return <FluClaims />;
}
