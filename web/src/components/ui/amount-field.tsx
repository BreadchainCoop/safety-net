"use client";

import { useId } from "react";
import { formatUnits } from "viem";
import { Caption } from "@breadcoop/ui";
import { formatAmount } from "@/lib/format";

/** Token amount input with a label, balance readout, and MAX shortcut. */
export function AmountField({
  label,
  value,
  onChange,
  balance,
  balanceLabel = "Balance",
  symbol,
  decimals = 18,
  disabled,
  help,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  balance?: bigint;
  balanceLabel?: string;
  symbol: string;
  decimals?: number;
  disabled?: boolean;
  help?: string;
  error?: boolean;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id}>
          <Caption className="text-surface-grey-2">{label}</Caption>
        </label>
        {balance !== undefined && (
          <button
            type="button"
            onClick={() => onChange(formatUnits(balance, decimals))}
            className="text-primary-jade text-xs font-medium hover:underline"
          >
            {balanceLabel}: {formatAmount(balance, decimals)} {symbol} · MAX
          </button>
        )}
      </div>
      <div className="border-paper-2 bg-paper-main focus-within:border-primary-jade mt-2 flex items-center gap-2 rounded-xl border px-4 py-3">
        <input
          id={id}
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          disabled={disabled}
          aria-invalid={error || undefined}
          aria-describedby={help ? helpId : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="font-breadDisplay text-text-standard placeholder:text-surface-grey w-full bg-transparent text-2xl font-bold outline-none disabled:opacity-60"
        />
        <span className="font-breadDisplay text-surface-grey-2 font-bold">
          {symbol}
        </span>
      </div>
      {help && (
        <span id={helpId} className="mt-1.5 block">
          <Caption className="text-surface-grey">{help}</Caption>
        </span>
      )}
    </div>
  );
}
