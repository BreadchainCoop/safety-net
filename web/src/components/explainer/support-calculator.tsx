"use client";

import Link from "next/link";
import { useState } from "react";
import { Body, Button, Caption } from "@breadcoop/ui";
import { ArrowRight } from "@phosphor-icons/react";
import { Card } from "@/components/ui/ui";
import { SliderField } from "@/components/ui/slider-field";
import { SupportRampChart } from "@/components/explainer/diagrams/support-ramp-chart";
import { IllustrationDisclaimer } from "@/components/explainer/illustration-disclaimer";
import {
  BROODFONDS_RATIO,
  groupRatioCap,
  MAX_REDEEM_RATIO,
  MIN_REDEEM_RATIO,
} from "@/lib/config";

/** Round to at most 2 decimals, trimming trailing zeros. */
const money = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "—";

/**
 * Interactive "what would a group like this get?" calculator — the crowdstake
 * landing calculator, mapped to mutual aid. Pure frontend math (the same
 * `groupRatioCap` the create form and the contract use), so it renders for
 * disconnected/SSG visitors with no wallet or reads. Money-first: leads with
 * the monthly support, not the multiplier.
 */
export function SupportCalculator() {
  const [contribution, setContribution] = useState(50);
  const [members, setMembers] = useState(30);
  const [ratio, setRatio] = useState(BROODFONDS_RATIO);

  const cap = groupRatioCap(members);
  const sustained = Math.min(ratio, cap);
  const monthlySustained = contribution * sustained;
  const monthlyFull = contribution * ratio;
  const daily = monthlySustained / 30;

  return (
    <Card className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <SliderField
          label="Everyone chips in / month"
          min={10}
          max={250}
          step={5}
          value={contribution}
          onChange={setContribution}
          suffix={<span className="text-surface-grey text-sm">BREAD</span>}
        />
        <SliderField
          label="People in the circle"
          min={2}
          max={50}
          step={1}
          value={members}
          onChange={setMembers}
        />
        <SliderField
          label="Support level"
          min={MIN_REDEEM_RATIO}
          max={MAX_REDEEM_RATIO}
          step={1}
          value={ratio}
          onChange={setRatio}
          suffix={<span className="text-surface-grey text-sm">×</span>}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border-primary-jade/30 bg-primary-jade/5 rounded-xl border p-4">
          <Caption className="text-surface-grey-2">
            Monthly support when you need it
          </Caption>
          <p className="font-breadDisplay text-primary-jade mt-1 text-3xl font-bold">
            ≈ {money(monthlySustained)}{" "}
            <span className="text-lg">BREAD</span>
          </p>
          <Body className="text-surface-grey-2 mt-1 text-xs">
            about {money(daily)} BREAD a day — for a {money(contribution)} BREAD
            monthly contribution.
          </Body>
          {sustained < ratio && (
            <Body className="text-surface-grey mt-2 text-xs">
              A bigger, fuller net backs more. A circle of {members} can support
              about {money(monthlySustained)} BREAD/month today, growing toward{" "}
              {money(monthlyFull)} as it fills up.
            </Body>
          )}
        </div>
        <div>
          <Caption className="text-surface-grey-2">
            How much a bigger circle can back
          </Caption>
          <div className="mt-2">
            <SupportRampChart
              ratio={ratio}
              contribution={contribution}
              highlightN={members}
            />
          </div>
        </div>
      </div>

      <Body className="text-surface-grey text-xs">
        The more people in your circle and the fuller the pool, the more it can
        back for whoever needs it — because only a few people need help at any
        one time. Drag the sliders to see it change.
      </Body>

      <IllustrationDisclaimer />

      <div>
        <Button
          as={Link}
          app="net"
          variant="primary"
          rightIcon={<ArrowRight />}
          href="/create"
        >
          Start a net like this
        </Button>
      </div>
    </Card>
  );
}
