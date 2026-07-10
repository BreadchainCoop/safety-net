"use client";

import Link from "next/link";
import { Body, Button, Chip, Heading1, Heading4 } from "@breadcoop/ui";
import {
  ArrowRight,
  EnvelopeSimple,
  Fingerprint,
  FirstAidKit,
  LockKey,
  Lightning,
  SealCheck,
  ShieldCheck,
  UploadSimple,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/ui";
import { NoteBox } from "@/components/ui/note-box";
import { StepFlow, type Step } from "@/components/explainer/step-flow";

// The member-facing flow.
const FLOW: Step[] = [
  {
    icon: FirstAidKit,
    title: "Get a diagnosis email",
    body: "When you actually have the flu, you receive a real, DKIM-signed email from an approved healthcare sender — a result, a prescription for a flu antiviral, or a note that names influenza or its ICD-10 code (J09–J11). Upload that .eml file.",
  },
  {
    icon: EnvelopeSimple,
    title: "Prove that inbox is yours",
    body: "Send yourself a one-line email with your wallet address as the subject. Your email provider (Gmail, Outlook…) signs it on the way out — which cryptographically proves you control the inbox the diagnosis was sent to. Only you can do that, so a leaked diagnosis email is useless to anyone else. Then upload that email too.",
  },
  {
    icon: Fingerprint,
    title: "Prove it — in your browser",
    body: "Your browser generates a single zero-knowledge proof over both emails: that the diagnosis is genuinely signed and matches the flu pattern, and that the same inbox attested your wallet. No email address is revealed — not even a hash of one.",
  },
  {
    icon: Lightning,
    title: "Get paid instantly — no vote",
    body: "You submit the proof and the pool pays you a fixed 7 days of support immediately. No request, no contest window, no group check-in — the proof is the approval.",
  },
];

// What the proof reveals vs. what it hides.
const PRIVACY: Step[] = [
  {
    icon: LockKey,
    title: "Stays on your device",
    body: "Both emails — subjects, bodies, your diagnosis, your email address, everyone on the thread — are read and verified locally in your browser. None of it is uploaded, and none of it is written to the blockchain. Your email address is never even hashed on-chain.",
  },
  {
    icon: SealCheck,
    title: "Goes on-chain",
    body: "Only the zero-knowledge proof and a few public values: which approved provider signed the diagnosis, which email provider signed your inbox proof, a one-time fingerprint of the diagnosis email (so it can't be reused), and your wallet address (so nobody can steal your proof). Not the diagnosis, not your email.",
  },
];

/** Public explainer for the ZK Email flu-claim flow (the /how/flu route). */
export function FluClaims() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-14 px-4 py-10">
      {/* Hero */}
      <section className="pt-6 text-center">
        <Chip size="small">ZK Email · instant settlement</Chip>
        <Heading1 className="text-text-standard mt-4">
          Prove you have the flu. Get support instantly.
        </Heading1>
        <Body className="text-surface-grey-2 mx-auto mt-4 max-w-xl">
          A Safety Net member who catches the flu can settle a claim in one step — by proving, with
          zero-knowledge cryptography, that they received a diagnosis email from an approved
          healthcare provider. No group vote, no waiting on a contest window, and the email itself
          never leaves their device.
        </Body>
      </section>

      {/* The flow */}
      <section aria-labelledby="flu-flow">
        <h2 id="flu-flow" className="sr-only">
          How a flu claim works
        </h2>
        <Heading4 className="text-text-standard mb-6">How a flu claim works</Heading4>
        <StepFlow steps={FLOW} />
      </section>

      {/* Privacy */}
      <section aria-labelledby="flu-privacy">
        <h2 id="flu-privacy" className="sr-only">
          What stays private
        </h2>
        <Heading4 className="text-text-standard mb-2">What&apos;s private, what&apos;s public</Heading4>
        <Body className="text-surface-grey-2 mb-6">
          A zero-knowledge proof lets you prove a statement is true without revealing the underlying
          data. Here, you prove &ldquo;an approved provider emailed me a flu diagnosis&rdquo; without
          showing anyone the email.
        </Body>
        <StepFlow steps={PRIVACY} />
        <NoteBox className="mt-6" icon>
          There is no pre-registration and no email address (or hash of one) stored anywhere on-chain.
          Control of your inbox is proven fresh, at claim time, by the email you sign yourself — so
          the wallet↔email link stays entirely private.
        </NoteBox>
      </section>

      {/* Trust model */}
      <section aria-labelledby="flu-trust">
        <h2 id="flu-trust" className="sr-only">
          What counts as a valid diagnosis
        </h2>
        <Heading4 className="text-text-standard mb-4">What counts as a valid diagnosis</Heading4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} weight="duotone" className="text-primary-jade" />
              <Heading4 className="text-text-standard text-base">Approved senders only</Heading4>
            </div>
            <Body className="text-surface-grey-2 text-sm">
              The email must be cryptographically signed (DKIM) by a healthcare domain the group has
              vetted and added. A random email from anywhere won&apos;t verify — the signature is
              checked against an on-chain registry of the provider&apos;s real signing keys.
            </Body>
          </Card>
          <Card className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <FirstAidKit size={20} weight="duotone" className="text-primary-jade" />
              <Heading4 className="text-text-standard text-base">A real diagnosis, not marketing</Heading4>
            </div>
            <Body className="text-surface-grey-2 text-sm">
              The content must contain &ldquo;influenza&rdquo;, an ICD-10 flu code (J09–J11), or a
              flu-specific antiviral (Tamiflu, Xofluza…). The bare word &ldquo;flu&rdquo; is
              deliberately rejected, so a &ldquo;get your flu shot&rdquo; newsletter can&apos;t be
              used to claim.
            </Body>
          </Card>
        </div>
        <NoteBox className="mt-4" tone="warning" icon>
          Each email can settle exactly one claim, ever — it&apos;s consumed by a one-time nullifier.
          The proof is bound to your wallet so it can&apos;t be stolen in the mempool, and a member
          can settle at most one flu claim per Safety Net every 90 days.
        </NoteBox>
      </section>

      {/* Reality check */}
      <section aria-labelledby="flu-reality">
        <h2 id="flu-reality" className="sr-only">
          The honest limits
        </h2>
        <Card className="border-primary-jade/40 bg-primary-jade/5 flex flex-col gap-3">
          <Heading4 className="text-text-standard">The honest limits</Heading4>
          <Body className="text-surface-grey-2 text-sm">
            Most US healthcare email is deliberately PHI-free — a &ldquo;you have a new result, log
            in&rdquo; notice with no diagnosis in it. So today only a narrow set of providers send
            an email that actually qualifies, and the approved list starts small and grows as each
            provider is validated against a real sample email. If you can&apos;t prove in the
            browser (the proving files are large), you can generate the proof with a command-line
            tool and upload the result instead.
          </Body>
        </Card>
      </section>

      {/* CTA */}
      <section>
        <Card className="border-primary-jade/40 bg-primary-jade/5 flex flex-col items-center gap-4 py-10 text-center">
          <Heading4 className="text-text-standard">There when you need it</Heading4>
          <Body className="text-surface-grey-2 max-w-md">
            Nothing to set up in advance — the day you&apos;re sick, upload your diagnosis email, prove
            your inbox, and settle. You&apos;ll find it on your Safety Net&apos;s page.
          </Body>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button app="net" variant="primary" as={Link} href="/" rightIcon={<ArrowRight />}>
              Go to my Safety Nets
            </Button>
            <Button app="net" variant="secondary" as={Link} href="/how" rightIcon={<UploadSimple />}>
              How Safety Nets work
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
