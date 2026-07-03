import type { Metadata } from "next";
import { GifSlot } from "@/components/gif-slot";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "How it works",
  description:
    "Every Safety Net flow, step by step: create, invite, start, deposit (with prepay), withdraw, contest, execute, decommission.",
  path: "/docs/",
});

interface Section {
  id: string;
  gif: string;
  title: string;
  body: string[];
}

const SECTIONS: Section[] = [
  {
    id: "create",
    gif: "create",
    title: "1. Create a Safety Net",
    body: [
      "A Safety Net is a shared savings pool with rules everyone agrees to up front: which token you save in, how much everyone deposits, and how withdrawals are approved.",
      "You create the net alone and become its first member — no address lists. Pick the group size, the one-off initial deposit, and the recurring deposit due every epoch (e.g. every 30 days). Deposits convert 1:1 into withdrawable balance — the redeem ratio is locked to ×1 in v1, so there's no leverage. Small withdrawals below the instant threshold pay out immediately; larger ones go through group review with a contest window and threshold.",
      "Right after creation the app generates one single-use invite link per open seat, signed by your wallet — share those privately to bring in the rest of your group.",
    ],
  },
  {
    id: "invite",
    gif: "invite-join",
    title: "2. Invite & join, then start",
    body: [
      "Invite links are generated automatically when the net is created, and the owner can make more from the net page while the net hasn't started. Each link contains a signature from the owner's wallet (no transaction, no gas) and can be redeemed exactly once.",
      "Whoever opens the link sees the net's rules — joining payment, recurring dues, current members — and joins by redeeming the invite on-chain. Invites stop working once the group hits its maximum size, and joining closes for good once the net starts.",
      "When at least the minimum number of members have joined, the owner starts the net. Starting locks membership — no more joins — and begins epoch 1: deposits open and recurring dues count from that moment.",
    ],
  },
  {
    id: "deposit",
    gif: "deposit",
    title: "3. Deposit",
    body: [
      "Deposits open once the owner starts the net. Your very first deposit is the initial deposit, paid exactly and in one payment — it activates your membership and sets your recurring dues.",
      "After that, you owe the recurring deposit every epoch. You can pay it in parts, and you can also pay another member's dues for them (the tokens still come from their wallet — they only save the gas). Every deposit adds 1:1 to your withdrawable balance.",
      "You can also pay ahead: deposit more than this epoch's dues and the extra prepays future epochs — the current epoch's remaining dues fill first, then the next epoch, and so on, up to 12 epochs ahead. The app previews exactly how a deposit will be allocated before you send it.",
      "Short on BREAD? Use the \"Get BREAD\" button in the nav (or the prompt on the deposit form) to mint BREAD 1:1 from xDAI — and, on embedded-wallet sign-ins, to buy xDAI first.",
    ],
  },
  {
    id: "withdraw",
    gif: "withdraw",
    title: "4. Withdraw",
    body: [
      'Withdrawals are measured in "days of income": one day is worth your monthly contribution ÷ 30 (the redeem ratio is ×1 in v1). Pick how many days you need and the app shows the exact amount.',
      "If the amount is at or below the net's instant threshold it's transferred immediately (up to a per-epoch limit of instant withdrawals). Anything larger creates a withdrawal request that your group can review first.",
      "For a large withdrawal you add a short reason (up to 200 words) explaining why you need the funds. It's stored on-chain and shown to every member, so they have the context to decide whether to contest.",
    ],
  },
  {
    id: "contest",
    gif: "contest",
    title: "5. Contest a request",
    body: [
      "Every large withdrawal opens a contest window (set when the net was created). Each request shows the requester's reason, so you can weigh it before deciding. During that window any member can contest the request — think of it as a veto vote.",
      "If more than the contest threshold percentage of members contest, the request is vetoed and no funds move. Each member can contest a given request only once.",
    ],
  },
  {
    id: "execute",
    gif: "execute",
    title: "6. Execute a withdrawal",
    body: [
      "Once the contest window closes without a veto, the request becomes executable. Anyone can trigger execution — the requested amount is transferred to the requester and deducted from their withdrawable balance.",
      "The app shows a live countdown on each request and flags the ones that are executable now.",
      "Every net page has an Activity feed showing its full history — creations, joins, deposits, withdrawals, requests, contests, vetoes and executions — each linking to the transaction on the block explorer.",
    ],
  },
  {
    id: "decommission",
    gif: "decommission",
    title: "7. Decommission",
    body: [
      "A Safety Net relies on everyone paying their dues. If any member missed their recurring deposit in a past epoch, the net becomes decommissionable and anyone may wind it down.",
      "Winding down returns each member's withdrawable balance and splits any remaining pool evenly between members. The net is then closed for good.",
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-10">
        <h1 className="font-breadDisplay text-text-standard text-4xl font-black uppercase">
          How it works
        </h1>
        <p className="text-surface-grey-2 mt-3">
          Safety Net is group savings with a social safety net: recurring
          deposits build a shared pool, and the group — not an institution —
          approves large withdrawals. Here&apos;s every flow, step by step.
        </p>
      </div>

      <nav className="border-paper-2 bg-paper-0 mb-10 rounded-2xl border p-5 text-sm">
        <span className="text-surface-grey-2 font-bold uppercase">
          Contents
        </span>
        <ol className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-primary-jade hover:underline"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-col gap-12">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id}>
            <h2 className="font-breadDisplay text-text-standard text-2xl font-bold uppercase">
              {s.title}
            </h2>
            {s.body.map((p, i) => (
              <p key={i} className="text-surface-grey-2 mt-3 leading-relaxed">
                {p}
              </p>
            ))}
            <div className="mt-4">
              <GifSlot name={s.gif} alt={`${s.title} walkthrough`} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
