import type { Metadata } from "next";
import { NetPageContent } from "@/components/net/net-page-content";
import { buildMetadata } from "@/lib/metadata";

// Server wrapper for metadata; the net id comes from the query string
// (static export), so the client NetPageContent does all the reading.
export const metadata: Metadata = buildMetadata({
  title: "Safety Net details",
  description:
    "Pool balance, members, deposits, and withdrawal requests of a Safety Net on Gnosis Chain.",
  path: "/net/",
});

export default function NetPage() {
  return <NetPageContent />;
}
