import type { ComponentType, ReactNode } from "react";
import { Body, Heading4 } from "@breadcoop/ui";
import { CaretDown, type IconProps } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface Step {
  title: string;
  body: ReactNode;
  icon?: ComponentType<IconProps>;
  /** Optional extra visual (diagram / stat) shown under the copy. */
  extra?: ReactNode;
}

/** Solid jade numbered circle (crowdstake-style emphasis). */
function StepCircle({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="bg-primary-jade text-paper-0 font-breadDisplay inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold"
    >
      {n}
    </span>
  );
}

/**
 * A vertical numbered flow with jade connector arrows between steps — the
 * crowdstake.fun "how it works" treatment, dependency-free (CSS + one Phosphor
 * glyph). On mobile the steps stack; the connector collapses to a short rule.
 */
export function StepFlow({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative">
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <StepCircle n={i + 1} />
                {!last && (
                  <span
                    aria-hidden
                    className="bg-primary-jade/30 my-1 w-0.5 flex-1"
                  />
                )}
              </div>
              <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-8")}>
                <div className="flex items-center gap-2">
                  {Icon && (
                    <Icon
                      size={22}
                      weight="duotone"
                      className="text-primary-jade shrink-0"
                      aria-hidden
                    />
                  )}
                  <Heading4 className="text-text-standard">{s.title}</Heading4>
                </div>
                <Body className="text-surface-grey-2 mt-1.5 text-sm">
                  {s.body}
                </Body>
                {s.extra && <div className="mt-3">{s.extra}</div>}
                {!last && (
                  <CaretDown
                    aria-hidden
                    size={16}
                    weight="bold"
                    className="text-primary-jade/40 mt-4 hidden sm:block"
                  />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
