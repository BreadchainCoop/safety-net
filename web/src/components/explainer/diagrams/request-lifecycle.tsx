import { Badge } from "@/components/ui/ui";

/**
 * The lifecycle of a large withdrawal request: Created → Contest window →
 * Executable → Executed, with a Vetoed branch. Uses the same Badge tones the
 * live requests list uses, so the legend matches what members actually see.
 */
export function RequestLifecycle() {
  const stages = [
    { label: "Requested", tone: "grey" as const },
    { label: "Contest window", tone: "jade" as const },
    { label: "Executable", tone: "warning" as const },
    { label: "Paid out", tone: "green" as const },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {stages.map((s, i) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <Badge tone={s.tone}>{s.label}</Badge>
            {i < stages.length - 1 && (
              <span aria-hidden className="text-surface-grey text-sm">
                →
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span aria-hidden className="text-surface-grey pl-1 text-xs">
          ↳ if enough members contest:
        </span>
        <Badge tone="red">Vetoed — no funds move</Badge>
      </div>
    </div>
  );
}
