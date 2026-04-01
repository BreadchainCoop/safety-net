"use client";

import { useState } from "react";
import { Heading3, Body, LiftedButton } from "@breadcoop/ui";
import { ShieldCheck, CurrencyCircleDollar, ArrowsClockwise, UsersThree, Rocket } from "@phosphor-icons/react";

const SCREENS = [
  {
    icon: ShieldCheck,
    title: "What is Safety Net?",
    description:
      "Safety Net is a mutual aid fund where members pool resources together. When someone needs help, they can request a withdrawal backed by the group's consensus.",
  },
  {
    icon: CurrencyCircleDollar,
    title: "How Deposits Work",
    description:
      "Each epoch (time period), members deposit a fixed amount. Your initial deposit joins you to the fund, and recurring deposits keep it active. Missing a deposit can make the fund decommissionable.",
  },
  {
    icon: ArrowsClockwise,
    title: "Withdrawing Funds",
    description:
      "Small withdrawals under the auto-threshold are approved instantly. Larger amounts go through a contest window where other members can challenge the request.",
  },
  {
    icon: UsersThree,
    title: "Voting & Contesting",
    description:
      "If a withdrawal is contested, all members vote. The fund's consensus threshold determines whether the withdrawal is approved or rejected. This keeps the fund fair for everyone.",
  },
  {
    icon: Rocket,
    title: "Getting Started",
    description:
      "Create a new fund and invite members, or join an existing fund via an invite link. Once enough members join and the start time arrives, the fund becomes active.",
  },
];

interface TutorialProps {
  onComplete: () => void;
}

export function Tutorial({ onComplete }: TutorialProps) {
  const [screen, setScreen] = useState(0);
  const current = SCREENS[screen];
  const Icon = current.icon;
  const isLast = screen === SCREENS.length - 1;

  return (
    <div className="card-shadow-border rounded-xl p-8 max-w-lg mx-auto text-center">
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-full bg-paper-1 flex items-center justify-center">
          <Icon size={32} className="text-primary-orange" />
        </div>
      </div>

      <Heading3 className="mb-3">{current.title}</Heading3>
      <Body className="mb-8 text-gray-600">{current.description}</Body>

      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-6">
        {SCREENS.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === screen ? "bg-primary-orange" : "bg-paper-1"
            }`}
          />
        ))}
      </div>

      <div className="flex gap-3 justify-center">
        {screen > 0 && (
          <LiftedButton onClick={() => setScreen((s) => s - 1)}>
            Back
          </LiftedButton>
        )}
        <LiftedButton
          onClick={() => {
            if (isLast) {
              onComplete();
            } else {
              setScreen((s) => s + 1);
            }
          }}
        >
          {isLast ? "Get Started" : "Next"}
        </LiftedButton>
        {!isLast && (
          <button
            onClick={onComplete}
            className="text-sm text-gray-500 hover:text-gray-700 px-3"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
