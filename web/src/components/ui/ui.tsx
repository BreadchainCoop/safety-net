"use client";

import type { ReactNode } from "react";
import { Body, Caption, Heading2, Heading4, LoadingIcon } from "@breadcoop/ui";
import { cn } from "@/lib/utils";

/** Page title + subtitle used at the top of every page. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <Heading2 className="text-text-standard">{title}</Heading2>
        {subtitle && (
          <Body className="text-surface-grey-2 mt-2">{subtitle}</Body>
        )}
      </div>
      {actions}
    </div>
  );
}

/** A bordered card surface. */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-paper-2 bg-paper-0 rounded-2xl border p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Labelled statistic tile. */
export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className={cn(accent && "border-primary-jade/40 bg-primary-jade/5")}>
      <Caption className="text-surface-grey-2">{label}</Caption>
      <Heading4 className="text-text-standard mt-2">{value}</Heading4>
      {sub && <Caption className="text-surface-grey mt-1 block">{sub}</Caption>}
    </Card>
  );
}

/** A horizontal progress bar (0..1), jade fill. */
export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="bg-paper-2 h-2 w-full overflow-hidden rounded-full">
      <div
        className="bg-primary-jade h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

/** Empty-state hint. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Card className="text-center">
      <Body className="text-surface-grey-2">{children}</Body>
    </Card>
  );
}

/** Centered loading row. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <Card className="flex items-center justify-center gap-3 py-10">
      <LoadingIcon app="net" className="w-6" />
      <Body className="text-surface-grey-2">{label}</Body>
    </Card>
  );
}

/** Error surface for failed reads. */
export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <Card className="border-system-red/40 bg-red-0/30 text-center">
      <Body className="text-red-main">{children}</Body>
    </Card>
  );
}

export type BadgeTone = "jade" | "green" | "red" | "warning" | "grey";

const BADGE_TONES: Record<BadgeTone, string> = {
  jade: "bg-[#CBE9E5] text-primary-jade",
  green: "bg-system-green/15 text-system-green",
  red: "bg-red-0 text-red-main",
  warning: "bg-system-warning/15 text-system-warning",
  grey: "bg-paper-2 text-surface-grey-2",
};

/** Small status pill. */
export function Badge({
  tone = "grey",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Definition-list row used in overview panels. */
export function InfoRow({
  label,
  children,
  help,
}: {
  label: string;
  children: ReactNode;
  help?: string;
}) {
  return (
    <div className="border-paper-2 flex items-start justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <span className="text-surface-grey-2" title={help}>
        {label}
      </span>
      <span className="text-text-standard text-right font-medium">
        {children}
      </span>
    </div>
  );
}
