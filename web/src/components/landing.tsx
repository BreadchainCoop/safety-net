"use client";

import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Body, Button, Chip, Heading1, Heading4 } from "@breadcoop/ui";
import {
  ArrowRight,
  HandCoins,
  Lightning,
  UsersThree,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/ui";

const FEATURES = [
  {
    icon: HandCoins,
    title: "Save together, steadily",
    body: "Your group agrees on the rules up front — which token, how much everyone deposits, how often. Dues build a shared pool, 1:1 with your withdrawable balance, and you can prepay months ahead.",
  },
  {
    icon: Lightning,
    title: "Instant when it's small",
    body: "Everyday withdrawals below your group's threshold pay out immediately, no questions asked — your money stays yours.",
  },
  {
    icon: UsersThree,
    title: "A group check-in when it's big",
    body: "Larger withdrawals open a short review window where any member can contest. Enough contests veto the request — accountability comes from your circle, not an institution.",
  },
] as const;

const STEPS = [
  {
    title: "Create",
    body: "Pick the token, deposits, and withdrawal rules — you start as the net's first member.",
  },
  {
    title: "Invite",
    body: "Share the auto-generated single-use invite links, then start the net once your group has joined.",
  },
  {
    title: "Deposit",
    body: "Pay your dues each epoch, in parts or ahead of time. You can even cover a friend's dues.",
  },
  {
    title: "Withdraw",
    body: "Take out what you need — instantly if it's small, after a group review if it's large.",
  },
] as const;

/**
 * Marketing landing shown to disconnected visitors (crowdstake.fun landing
 * structure, condensed to a single page): hero, feature cards, how-it-works,
 * CTA. Connected users see the dashboard instead.
 */
export function Landing() {
  const { openConnectModal } = useConnectModal();

  return (
    <div className="flex flex-col gap-14 pb-8">
      {/* Hero */}
      <section className="mx-auto max-w-3xl pt-6 text-center">
        <div className="flex justify-center">
          <Chip size="small">On Gnosis Chain</Chip>
        </div>
        <div className="mt-4">
          <Heading1 className="text-text-standard">
            Group savings with a social safety net
          </Heading1>
        </div>
        <Body className="text-surface-grey-2 mx-auto mt-4 max-w-xl">
          Save with people you trust. Everyone chips in every epoch, small
          withdrawals are instant, and big ones get a group check-in first. No
          banks, no forms — just your circle and a contract you all agreed to.
        </Body>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            app="net"
            variant="primary"
            rightIcon={<ArrowRight />}
            onClick={openConnectModal}
          >
            Connect wallet
          </Button>
          <Button as={Link} app="net" variant="secondary" href="/docs">
            How it works
          </Button>
        </div>
      </section>

      {/* Features */}
      <section aria-labelledby="landing-features">
        <h2 id="landing-features" className="sr-only">
          What Safety Net does
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <f.icon size={28} weight="duotone" className="text-primary-jade" />
              <div className="mt-3">
                <Heading4 className="text-text-standard">{f.title}</Heading4>
              </div>
              <Body className="text-surface-grey-2 mt-2 text-sm">{f.body}</Body>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="landing-how">
        <h2
          id="landing-how"
          className="font-breadDisplay text-text-standard text-2xl font-bold uppercase"
        >
          How it works
        </h2>
        <ol className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full">
                <span
                  aria-hidden
                  className="bg-primary-jade/10 text-primary-jade font-breadDisplay inline-flex h-8 w-8 items-center justify-center rounded-full font-bold"
                >
                  {i + 1}
                </span>
                <div className="mt-2">
                  <Heading4 className="text-text-standard">{s.title}</Heading4>
                </div>
                <Body className="text-surface-grey-2 mt-1 text-sm">
                  {s.body}
                </Body>
              </Card>
            </li>
          ))}
        </ol>
        <p className="text-surface-grey-2 mt-4 text-sm">
          Want the full walkthrough with screen recordings?{" "}
          <Link
            href="/docs"
            className="text-primary-jade font-bold hover:underline"
          >
            Read the docs
          </Link>
          .
        </p>
      </section>

      {/* CTA band */}
      <section>
        <Card className="border-primary-jade/40 bg-primary-jade/5 flex flex-col items-center gap-4 py-10 text-center">
          <Heading4 className="text-text-standard">
            Ready to build your net?
          </Heading4>
          <Body className="text-surface-grey-2 max-w-md">
            Connect a wallet to start a Safety Net with your people — or ask a
            friend who already has one for an invite link.
          </Body>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              app="net"
              variant="primary"
              rightIcon={<ArrowRight />}
              onClick={openConnectModal}
            >
              Get started
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
