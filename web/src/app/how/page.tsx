import type { Metadata } from "next";
import { HowItWorks } from "@/components/explainer/how-it-works";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "How it works",
  description:
    "A visual guide to Safety Net: the mutual-aid lifecycle, why the Broodfonds support ratio holds up, and an interactive calculator for your own group.",
  path: "/how/",
});

export default function HowPage() {
  return <HowItWorks />;
}
