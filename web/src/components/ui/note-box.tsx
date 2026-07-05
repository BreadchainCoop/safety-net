import type { ReactNode } from "react";
import { Info } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type NoteTone = "jade" | "warning" | "red";

const TONES: Record<NoteTone, string> = {
  jade: "border-primary-jade/30 bg-primary-jade/5 text-surface-grey-2",
  warning: "border-system-warning/40 bg-system-warning/10 text-surface-grey-2",
  red: "border-system-red/40 bg-red-0/40 text-surface-grey-2",
};

const ICON_TONES: Record<NoteTone, string> = {
  jade: "text-primary-jade",
  warning: "text-system-warning",
  red: "text-red-main",
};

/**
 * The canonical "explain a mechanic" callout — the jade/5 border box used
 * across the create form (SupportRateNote), the /how explainer, and the panels.
 * Extracted so every explanatory surface renders identically. Optional `icon`
 * shows the Info glyph; `tone` switches to warning/red for cautions.
 */
export function NoteBox({
  children,
  tone = "jade",
  icon = false,
  className,
}: {
  children: ReactNode;
  tone?: NoteTone;
  icon?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-xs leading-relaxed",
        TONES[tone],
        className,
      )}
    >
      {icon ? (
        <div className="flex items-start gap-2">
          <Info
            size={16}
            weight="fill"
            className={cn("mt-0.5 shrink-0", ICON_TONES[tone])}
            aria-hidden
          />
          <div>{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
