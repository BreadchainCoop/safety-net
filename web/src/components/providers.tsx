"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { PRIVY_ENABLED } from "@/lib/config";
import { GeneralProviders } from "@/components/providers-general";

// The Privy tree is code-split behind next/dynamic so `@privy-io/*` only loads
// when Privy is enabled. `PRIVY_ENABLED` is a build-time constant (env inlined
// by Next), so on the general/verify path this branch is statically dead and
// the Privy chunk is never requested at runtime.
const PrivyProviders = dynamic(
  () => import("@/components/providers-privy").then((m) => m.PrivyProviders),
  { ssr: false },
);

export function Providers({ children }: { children: ReactNode }) {
  if (PRIVY_ENABLED) {
    return <PrivyProviders>{children}</PrivyProviders>;
  }
  return <GeneralProviders>{children}</GeneralProviders>;
}
