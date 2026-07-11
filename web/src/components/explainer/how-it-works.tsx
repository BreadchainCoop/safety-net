"use client";

import Link from "next/link";
import { Body, Button, Chip, Heading1, Heading4 } from "@breadcoop/ui";
import {
  ArrowRight,
  HandCoins,
  Handshake,
  Lifebuoy,
  ShieldCheck,
  TrendUp,
  Umbrella,
  UsersThree,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/ui";
import { StepFlow, type Step } from "@/components/explainer/step-flow";
import { SupportCalculator } from "@/components/explainer/support-calculator";
import {
  VaultDiagram,
  VaultDiagramCaption,
} from "@/components/explainer/diagrams/vault-diagram";
import { RequestLifecycle } from "@/components/explainer/diagrams/request-lifecycle";

const LIFECYCLE: Step[] = [
  {
    icon: Handshake,
    title: "Agree",
    body: "Your circle picks the rules together: which token, how much everyone chips in each month, and how big a withdrawal needs a group check-in.",
  },
  {
    icon: HandCoins,
    title: "Chip in",
    body: "Everyone pays the same amount into one shared pool, month after month. Your balance is tracked as yours — deposits stay yours, not the fund's.",
  },
  {
    icon: TrendUp,
    title: "Build a cushion",
    body: "Month by month the pool grows into a real cushion — one the whole group can lean on when someone hits a rough patch.",
  },
  {
    icon: Lifebuoy,
    title: "Get support",
    body: "When a member is in need, they draw monthly support from the pool — far more than they put in on their own. Small amounts pay out instantly; bigger ones get a quick group check-in.",
  },
  {
    icon: ShieldCheck,
    title: "Look out for each other",
    body: "The group reviews large requests together, and if the circle ever winds down, everyone gets their balance plus an even share of the pool back. No bank, no forms — just your people.",
  },
];

const MECHANISM: Step[] = [
  {
    icon: Umbrella,
    title: "Most months, most people are fine",
    body: "Illness, a lost contract, a broken leg — they hit a few people at a time, not everyone at once. On any given month, only a small handful of your circle is actually drawing support.",
  },
  {
    icon: HandCoins,
    title: "So a little from everyone becomes a lot for someone",
    body: "When everyone chips in a small amount each month and only one or two need help, the whole group's contributions stand behind them. That's why the support you can draw is many times what you pay in — it's the circle catching you, not a return on your money.",
  },
  {
    icon: UsersThree,
    title: "Bigger circles are steadier",
    body: "The more people in your net, the more predictable it is: one rough month barely moves the average, so the group can comfortably promise more support to whoever needs it.",
  },
  {
    icon: TrendUp,
    title: "It grows into the promise",
    body: "A brand-new net hasn't pooled much yet, so it starts by backing smaller amounts and grows toward the full promise as everyone keeps chipping in. The app always shows what your net can support today.",
  },
  {
    icon: ShieldCheck,
    title: "The circle stays in control",
    body: "Big requests get a quick group check-in, and if someone stops chipping in, anyone can wind the net down so everyone gets their share back. It works because the group can always weigh in — no bank, no bureaucracy.",
  },
];

/** The visual, calculator-driven "how it works" page (crowdstake.fun role). */
export function HowItWorks() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-16 pb-10">
      {/* Hero */}
      <section className="pt-6 text-center">
        <div className="flex justify-center">
          <Chip size="small">Mutual aid, on-chain</Chip>
        </div>
        <div className="mt-4">
          <Heading1 className="text-text-standard">
            How a Safety Net works
          </Heading1>
        </div>
        <Body className="text-surface-grey-2 mx-auto mt-4 max-w-xl">
          A Safety Net is a savings circle with a social safety net built in:
          everyone chips in a little each month, and any member who hits hard
          times can draw real monthly support from the shared pool — far more
          than they put in alone.
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
        <div className="mt-6 grid gap-8 lg:grid-cols-3 lg:items-start">
          <div className="lg:col-span-2">
            <StepFlow steps={LIFECYCLE} />
          </div>
          <div className="lg:sticky lg:top-24">
            <Card>
              <VaultDiagram />
              <VaultDiagramCaption />
            </Card>
          </div>
        </div>
      </section>

      {/* 2.2 Why it works, in plain terms */}
      <section aria-labelledby="how-ratio">
        <h2
          id="how-ratio"
          className="font-breadDisplay text-text-standard text-2xl font-bold uppercase"
        >
          How a little becomes a lot
        </h2>
        <Body className="text-surface-grey-2 mt-2">
          The support you can draw is bigger than what you pay in — sometimes a
          lot bigger. That&apos;s not a trick or a return on investment.
          It&apos;s just what happens when a group shares risk together.
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
          Drag the sliders to see the monthly support a group like yours could
          give someone in need — the same numbers you&apos;ll see on the create
          page.
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
          Small withdrawals pay out instantly. Anything bigger opens a short
          window for the circle to weigh in before the money moves.
        </Body>
        <Card className="mt-6">
          <RequestLifecycle />
          <Body className="text-surface-grey-2 mt-4 text-sm">
            The person asking writes a short reason, visible to everyone. If
            enough members object inside the window, the request is turned down
            and no money moves. Otherwise it goes through.
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
