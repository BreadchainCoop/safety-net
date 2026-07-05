"use client";

import Link from "next/link";
import { Body, Button, Chip, Heading1, Heading4 } from "@breadcoop/ui";
import {
  ArrowRight,
  Coins,
  HandCoins,
  Handshake,
  Lifebuoy,
  ShieldCheck,
  TrendUp,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/ui";
import { NoteBox } from "@/components/ui/note-box";
import { StepFlow, type Step } from "@/components/explainer/step-flow";
import { SupportCalculator } from "@/components/explainer/support-calculator";
import {
  VaultDiagram,
  VaultDiagramCaption,
} from "@/components/explainer/diagrams/vault-diagram";
import { RequestLifecycle } from "@/components/explainer/diagrams/request-lifecycle";
import { RatioRampChart } from "@/components/explainer/diagrams/ratio-ramp-chart";
import { BROODFONDS_RATIO } from "@/lib/config";

const LIFECYCLE: Step[] = [
  {
    icon: Handshake,
    title: "Agree",
    body: "Your circle picks the rules together: which token, how much everyone deposits each epoch, and how big a withdrawal needs a group review.",
  },
  {
    icon: HandCoins,
    title: "Deposit",
    body: "Everyone pays the same recurring dues into one shared pool. Your money is tracked as yours — deposits stay yours, not the fund's.",
  },
  {
    icon: TrendUp,
    title: "Build",
    body: "Each deposit multiplies by the support ratio into your withdrawable balance. The pool grows into a cushion the whole group stands on.",
  },
  {
    icon: Lifebuoy,
    title: "Support",
    body: "When a member is in need, they draw monthly support from the pool — up to the support ratio × their dues. Small needs pay out instantly; large ones get a quick group check-in.",
  },
  {
    icon: ShieldCheck,
    title: "Protect",
    body: "Any member can contest a large request inside the window. Enough contests veto it. If the group ever winds down, everyone gets their balance plus an even split of the pool back.",
  },
];

const MECHANISM: Step[] = [
  {
    icon: Coins,
    title: "×22 sounds impossible — until you count who's actually in need",
    body: "In any given month only a small share of a group is drawing support. The Broodfonds convention assumes about 2%. If 1 in 50 needs help, the other 49 are quietly backing them.",
  },
  {
    title: "So each unit of dues can back roughly ×22 of support",
    body: "1 ÷ 2% ≈ 50 in theory; the protocol keeps a safety margin on top, landing near ×22 for a large, healthy group. That's the pooling multiplier — not interest, not yield. It only works because most members aren't claiming at once.",
    extra: (
      <NoteBox>
        <strong className="text-text-standard">No magic, no lending.</strong>{" "}
        Nobody borrows your deposit and nobody pays interest. The multiplier is
        pure mutual pooling: many small monthly contributions standing behind the
        few who need help this month.
      </NoteBox>
    ),
  },
  {
    title: "Bigger groups make the multiplier safer, not bigger",
    body: "With just a few members, one unlucky month swings the average hard — so the sustainable ratio is capped lower. As the group grows, the law of large numbers smooths that 2% and the cap climbs toward the full rate.",
    extra: (
      <div className="max-w-sm">
        <RatioRampChart ratio={BROODFONDS_RATIO} />
      </div>
    ),
  },
  {
    title: "Your effective ratio ramps as the pool fills",
    body: "A brand-new net can't pay ×22 on day one — there's nothing pooled yet. The effective ratio starts low and climbs toward the ratio you configured as members deposit. The app always shows both: “×22 configured (×N effective now).”",
  },
  {
    icon: ShieldCheck,
    title: "Contest + wind-down keep it honest",
    body: "Large withdrawals are contestable by the group. A member who stops paying makes the net decommissionable, and winding down returns everyone's balance pro-rata. Solidarity leverage only works because the group can always say no.",
  },
];

/** The visual, calculator-driven "how it works" page (crowdstake.fun role). */
export function HowItWorks() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-16 pb-10">
      {/* Hero */}
      <section className="pt-6 text-center">
        <div className="flex justify-center">
          <Chip size="small">Broodfonds, on-chain</Chip>
        </div>
        <div className="mt-4">
          <Heading1 className="text-text-standard">
            How a Safety Net works
          </Heading1>
        </div>
        <Body className="text-surface-grey-2 mx-auto mt-4 max-w-xl">
          A Safety Net is a mutual-aid savings circle: everyone chips in a little
          each month, and any member who hits hard times can draw real monthly
          support from the shared pool — many times their own contribution.
          Here&apos;s exactly how, and why the math holds up.
        </Body>
      </section>

      {/* 2.1 Lifecycle */}
      <section aria-labelledby="how-lifecycle">
        <h2
          id="how-lifecycle"
          className="font-breadDisplay text-text-standard text-2xl font-bold uppercase"
        >
          The lifecycle
        </h2>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-start">
          <StepFlow steps={LIFECYCLE} />
          <div className="lg:pt-2">
            <Card>
              <VaultDiagram />
              <VaultDiagramCaption />
            </Card>
          </div>
        </div>
      </section>

      {/* 2.2 Mechanism deep-dive */}
      <section aria-labelledby="how-ratio">
        <h2
          id="how-ratio"
          className="font-breadDisplay text-text-standard text-2xl font-bold uppercase"
        >
          Why ×22 isn&apos;t magic
        </h2>
        <Body className="text-surface-grey-2 mt-2">
          The support ratio is the one part that looks too good to be true. It
          isn&apos;t — it&apos;s actuarial pooling, and the contract enforces a
          cap that keeps it sustainable.
        </Body>
        <div className="mt-6">
          <StepFlow steps={MECHANISM} />
        </div>
      </section>

      {/* 2.3 Calculator */}
      <section aria-labelledby="how-calc">
        <h2
          id="how-calc"
          className="font-breadDisplay text-text-standard text-2xl font-bold uppercase"
        >
          Try it with your group
        </h2>
        <Body className="text-surface-grey-2 mt-2">
          Drag the sliders to see what a group like yours could sustainably back
          — the same numbers you&apos;ll see on the create page.
        </Body>
        <div className="mt-6">
          <SupportCalculator />
        </div>
      </section>

      {/* 2.4 Requests */}
      <section aria-labelledby="how-requests">
        <h2
          id="how-requests"
          className="font-breadDisplay text-text-standard text-2xl font-bold uppercase"
        >
          Big claims get a group check-in
        </h2>
        <Body className="text-surface-grey-2 mt-2">
          Small withdrawals pay out instantly. Anything over your group&apos;s
          petty-cash threshold opens a contest window — a chance for the circle
          to weigh in before funds move.
        </Body>
        <Card className="mt-6">
          <RequestLifecycle />
          <Body className="text-surface-grey-2 mt-4 text-sm">
            The requester writes a short reason, visible to everyone. If more than
            the group&apos;s threshold of members contest inside the window, the
            request is vetoed and no funds move. Otherwise it becomes executable
            and pays out.
          </Body>
        </Card>
      </section>

      {/* CTA */}
      <section>
        <Card className="border-primary-jade/40 bg-primary-jade/5 flex flex-col items-center gap-4 py-10 text-center">
          <Heading4 className="text-text-standard">
            Ready to build your net?
          </Heading4>
          <Body className="text-surface-grey-2 max-w-md">
            Start one with your people, or read the full step-by-step reference
            with screen recordings.
          </Body>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              as={Link}
              app="net"
              variant="primary"
              rightIcon={<ArrowRight />}
              href="/create"
            >
              Create a Safety Net
            </Button>
            <Button as={Link} app="net" variant="secondary" href="/docs">
              Full reference
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
