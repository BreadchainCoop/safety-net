"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Body, Button, Heading3 } from "@breadcoop/ui";
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  HandDeposit,
  Lifebuoy,
  Sparkle,
  UsersThree,
  type IconProps,
} from "@phosphor-icons/react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Slide {
  Icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    Icon: Lifebuoy,
    title: "What is a Safety Net?",
    body: "A Safety Net is a mutual-aid savings circle. A small group pools recurring deposits so that any member can draw on the fund when they need it — a modern, on-chain take on a rotating savings club.",
  },
  {
    Icon: UsersThree,
    title: "How membership works",
    body: "You create a net on your own, then invite people with a link. Everyone accepts and joins, and once the group is set the owner starts the net. From that point deposits, withdrawals, and requests are live.",
  },
  {
    Icon: Coins,
    title: "Depositing your dues",
    body: "Each epoch every member deposits a fixed amount in BREAD. You can pay a little at a time or prepay several epochs ahead — even cover another member's dues if they're short.",
  },
  {
    Icon: HandDeposit,
    title: "Requesting a withdrawal",
    body: "Small withdrawals are instant. Larger ones open a group review: you give a reason, and members have a window to contest it before it executes. It keeps the fund fair and transparent.",
  },
  {
    Icon: Sparkle,
    title: "Getting help",
    body: "That's the tour! You can reopen it any time from the “How it works” button. For the full details on epochs, requests, and contesting, head to the docs.",
  },
];

const LAST = SLIDES.length - 1;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function OnboardingModal({
  onClose,
  onDone,
}: {
  /** Backdrop click / re-open close — leaves the "seen" flag alone. */
  onClose: () => void;
  /** Skip / Done / Escape — marks the tour permanently seen. */
  onDone: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  const next = () => setCurrent((c) => (c >= LAST ? c : c + 1));
  const prev = () => setCurrent((c) => (c <= 0 ? c : c - 1));

  // Focus trap + Escape (Escape marks seen, same as Skip/Done).
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDone();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onDone],
  );

  // Move focus into the dialog on open; lock body scroll; restore on unmount.
  useEffect(() => {
    const root = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    root?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  const slide = SLIDES[current];
  const Icon = slide.Icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={onKeyDown}
        className="border-paper-2 bg-paper-0 relative flex w-full max-w-lg flex-col rounded-2xl border p-6 text-center shadow-xl"
      >
        <div className="flex items-center justify-end">
          <Button
            app="net"
            variant="light"
            size="sm"
            onClick={onDone}
            className="text-surface-grey-2"
          >
            Skip
          </Button>
        </div>

        <figure className="text-primary-jade mx-auto mt-2 mb-4">
          <Icon size={48} aria-hidden />
        </figure>

        <span id={titleId}>
          <Heading3 className="text-text-standard">{slide.title}</Heading3>
        </span>
        <span id={descId} className="mx-auto mt-3 block max-w-sm">
          <Body className="text-surface-grey-2">{slide.body}</Body>
        </span>

        {current === LAST && (
          <Link
            href="/docs"
            className="text-primary-jade mt-3 inline-block text-sm font-bold underline"
            onClick={onDone}
          >
            Read the docs
          </Link>
        )}

        <div
          className="my-6 flex items-center justify-center gap-2"
          role="tablist"
          aria-label="Onboarding progress"
        >
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={i === current}
              aria-label={`Go to slide ${i + 1}: ${s.title}`}
              onClick={() => setCurrent(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === current
                  ? "bg-primary-jade w-6"
                  : "bg-paper-2 hover:bg-surface-grey w-2",
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            app="net"
            variant="secondary"
            onClick={prev}
            disabled={current === 0}
            leftIcon={<ArrowLeft size={18} aria-hidden />}
          >
            Back
          </Button>
          {current === LAST ? (
            <Button
              app="net"
              variant="primary"
              onClick={onDone}
              leftIcon={<Sparkle size={18} aria-hidden />}
            >
              Done
            </Button>
          ) : (
            <Button
              app="net"
              variant="primary"
              onClick={next}
              rightIcon={<ArrowRight size={18} aria-hidden />}
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
