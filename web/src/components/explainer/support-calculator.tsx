"use client";

import Link from "next/link";
import { useState } from "react";
import { Body, Button, Caption } from "@breadcoop/ui";
import { ArrowRight } from "@phosphor-icons/react";
import { Card } from "@/components/ui/ui";
import { NoteBox } from "@/components/ui/note-box";
import { SliderField } from "@/components/ui/slider-field";
import { RatioRampChart } from "@/components/explainer/diagrams/ratio-ramp-chart";
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
 * landing calculator, mapped to Broodfonds solidarity. Pure frontend math (the
 * same `groupRatioCap` + support-rate formula the create form and the contract
 * use), so it renders for disconnected/SSG visitors with no wallet or reads.
 */
export function SupportCalculator() {
  const [contribution, setContribution] = useState(50);
  const [members, setMembers] = useState(30);
  const [ratio, setRatio] = useState(BROODFONDS_RATIO);

  const cap = groupRatioCap(members);
  const sustained = Math.min(ratio, cap);
  const monthlyConfigured = contribution * ratio;
  const monthlySustained = contribution * sustained;
  const daily = monthlySustained / 30;

  return (
    <Card className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <SliderField
          label="Monthly contribution"
          min={10}
          max={250}
          step={5}
          value={contribution}
          onChange={setContribution}
          suffix={<span className="text-surface-grey text-sm">BREAD</span>}
        />
        <SliderField
          label="Group size"
          min={2}
          max={50}
          step={1}
          value={members}
          onChange={setMembers}
        />
        <SliderField
          label="Support ratio"
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
            Monthly support when in need
          </Caption>
          <p className="font-breadDisplay text-primary-jade mt-1 text-3xl font-bold">
            ≈ {money(monthlySustained)}{" "}
            <span className="text-lg">BREAD/mo</span>
          </p>
          <Body className="text-surface-grey-2 mt-1 text-xs">
            at ×{sustained} · about {money(daily)} BREAD/day
          </Body>
          {sustained < ratio && (
            <Body className="text-surface-grey mt-2 text-xs">
              You picked ×{ratio} (≈ {money(monthlyConfigured)} BREAD/mo). A group
              of {members} sustainably backs about ×{sustained} today; support
              ramps toward the full rate as the group and its pool grow.
            </Body>
          )}
        </div>
        <div>
          <Caption className="text-surface-grey-2">
            What a group this size safely backs
          </Caption>
          <div className="mt-2">
            <RatioRampChart ratio={ratio} highlightN={members} />
          </div>
        </div>
      </div>

      <NoteBox>
        <strong className="text-text-standard">The math, in the open.</strong>{" "}
        Support = your contribution × the ratio your group sustainably backs.
        That sustainable cap is{" "}
        <code className="text-primary-jade">
          ⌊10000 / (200 + z·√(200·9800/N))⌋
        </code>{" "}
        — the same actuarial formula the contract enforces on-chain (expected
        in-need share ≈ 2%, safety factor z = 1.65).
      </NoteBox>

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
