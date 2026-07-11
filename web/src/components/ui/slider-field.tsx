"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

/**
 * Styled range input (design-system jade/paper tokens; rules in globals.css).
 * WebKit has no ::-webkit-range-progress, so the filled track is painted with
 * an inline gradient sized to the value.
 *
 * Controlled and clamp-tolerant: a `value` outside [min, max] renders the
 * thumb pinned at the edge without mutating the source — pairing text inputs
 * stay free to hold out-of-range drafts.
 */
export function Slider({
  id,
  min,
  max,
  step = 1,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  className = "",
}: {
  id?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const clamped = Math.min(Math.max(value, min), max);
  const percent = max > min ? ((clamped - min) / (max - min)) * 100 : 0;

  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={clamped}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`slider-input ${className}`}
      style={{
        background: `linear-gradient(to right, var(--color-primary-jade, #286b63) ${percent}%, var(--color-paper-2, #e5e0d3) ${percent}%)`,
      }}
    />
  );
}

/**
 * Slider + compact number box sharing one numeric state (drag OR type).
 * The parent's `value` is canonical; while the box is focused it holds a local
 * draft so typing "1" en route to "15" doesn't snap to the minimum, committing
 * the parsed value on change and clamping only on blur.
 */
export function SliderField({
  id,
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  format,
  suffix,
  help,
  disabled = false,
}: {
  id?: string;
  label: ReactNode;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (next: number) => void;
  /** Right-hand readout when no editable box is wanted. */
  format?: (v: number) => string;
  suffix?: ReactNode;
  help?: ReactNode;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Label the number box by the visible label element (works even when `label`
  // is a ReactNode, where a string aria-label can't be derived).
  const labelId = useId();

  // External changes (slider drags, form resets) overwrite an unfocused draft.
  useEffect(() => {
    setDraft(null);
  }, [value]);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n)) onChange(n);
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <label
          id={labelId}
          htmlFor={id}
          className="text-surface-grey-2 text-xs font-bold"
        >
          {label}
        </label>
        {format ? (
          <span className="text-text-standard text-sm font-bold">
            {format(value)}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <input
              value={draft ?? String(value)}
              inputMode="numeric"
              disabled={disabled}
              aria-labelledby={labelId}
              onChange={(e) => {
                setDraft(e.target.value);
                commit(e.target.value);
              }}
              onBlur={() => {
                setDraft(null);
                onChange(Math.min(Math.max(value, min), max));
              }}
              className="border-paper-2 bg-paper-main text-text-standard focus:border-primary-jade w-20 rounded-xl border px-2 py-1 text-right text-sm outline-none disabled:opacity-60"
            />
            {suffix}
          </span>
        )}
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(v) => {
          setDraft(null);
          onChange(v);
        }}
        disabled={disabled}
        ariaLabel={typeof label === "string" ? label : undefined}
        className="mt-2"
      />
      {help && <p className="text-surface-grey mt-1.5 text-xs">{help}</p>}
    </div>
  );
}
