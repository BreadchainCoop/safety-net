"use client";

import { Warning } from "@phosphor-icons/react";
import { isContractConfigured } from "@/lib/config";

/**
 * Shown while NEXT_PUBLIC_SAFETYNET_ADDRESS is still the zero-address
 * placeholder (the contract isn't deployed / configured yet).
 */
export function ConfigWarning() {
  if (isContractConfigured()) return null;
  return (
    <div className="section-container pt-4">
      <div className="border-system-warning/40 bg-system-warning/10 text-system-warning flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium">
        <Warning size={16} weight="fill" className="shrink-0" />
        SafetyNet contract address not configured — set
        NEXT_PUBLIC_SAFETYNET_ADDRESS to the deployed proxy on Gnosis. On-chain
        reads and writes are disabled until then.
      </div>
    </div>
  );
}
