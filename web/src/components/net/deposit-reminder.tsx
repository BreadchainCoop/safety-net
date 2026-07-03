"use client";

import { useMemo } from "react";
import { Caption } from "@breadcoop/ui";
import { CalendarPlus, DownloadSimple } from "@phosphor-icons/react";
import { Card } from "@/components/ui/ui";
import {
  describeCadence,
  downloadICS,
  googleCalendarUrl,
  outlookCalendarUrl,
  recurrenceFromEpochSeconds,
  yahooCalendarUrl,
  type CalendarEvent,
} from "@/lib/calendar";
import { formatAmount } from "@/lib/format";
import type { SafetyNetDetails } from "@/lib/types";
import { useTokenInfo } from "@/hooks/use-token";

/**
 * "Never miss a deposit" — recurring calendar reminders for a member's dues.
 *
 * Only meaningful for a STARTED net (safetyNetStart != 0): the reminder recurs
 * on the epoch cadence, anchored to the next epoch boundary so the first event
 * is in the future. Everything is built client-side (see @/lib/calendar).
 */
export function DepositReminder({ details }: { details: SafetyNetDetails }) {
  const net = details.safetyNet;
  const { symbol, decimals } = useTokenInfo(net.token);

  const started = net.safetyNetStart !== 0n;
  const epochSeconds = Number(net.epochDuration);

  const event = useMemo<CalendarEvent | null>(() => {
    if (!started || epochSeconds <= 0) return null;

    const start = Number(net.safetyNetStart);
    const nowSec = Math.floor(Date.now() / 1000);
    // Anchor to the next epoch boundary at/after now so the first reminder is
    // upcoming rather than in the past.
    const elapsed = Math.max(0, nowSec - start);
    const epochsPassed = Math.ceil(elapsed / epochSeconds);
    const nextBoundarySec = start + epochsPassed * epochSeconds;

    const cadence = describeCadence(epochSeconds);
    const dues = `${formatAmount(net.fixedDeposit, decimals)} ${symbol}`;

    return {
      title: `Safety Net #${net.id.toString()} — deposit dues`,
      description: `Deposit your ${dues} dues into Safety Net #${net.id.toString()} (recurs ${cadence}). Open your net: check the app to pay this epoch's dues.`,
      startTime: new Date(nextBoundarySec * 1000),
      recurrence: recurrenceFromEpochSeconds(epochSeconds),
      fileName: `safety-net-${net.id.toString()}-deposit`,
    };
  }, [
    started,
    epochSeconds,
    net.safetyNetStart,
    net.fixedDeposit,
    net.id,
    decimals,
    symbol,
  ]);

  if (!event) return null;

  const linkClass =
    "inline-flex items-center justify-center gap-1.5 rounded-xl border border-paper-2 bg-paper-main px-3 py-2 text-sm font-bold text-text-standard transition-colors hover:border-primary-jade focus-visible:border-primary-jade focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-jade";

  const cadence = describeCadence(epochSeconds);

  return (
    <Card>
      <Caption className="text-surface-grey-2">Never miss a deposit</Caption>
      <p className="text-text-standard mt-2 text-sm">
        Dues of{" "}
        <span className="font-bold">
          {formatAmount(net.fixedDeposit, decimals)} {symbol}
        </span>{" "}
        {cadence}. Add a recurring reminder to your calendar.
      </p>

      <div
        role="group"
        aria-label="Add deposit reminder to a calendar"
        className="mt-4 grid grid-cols-2 gap-2"
      >
        <a
          className={linkClass}
          href={googleCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Add recurring deposit reminder to Google Calendar"
        >
          <CalendarPlus size={16} aria-hidden />
          Google
        </a>
        <a
          className={linkClass}
          href={outlookCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Add deposit reminder to Outlook (set recurrence manually)"
        >
          <CalendarPlus size={16} aria-hidden />
          Outlook
        </a>
        <button
          type="button"
          className={linkClass}
          onClick={() => downloadICS(event)}
          aria-label="Download an Apple Calendar (.ics) file with a recurring deposit reminder"
        >
          <DownloadSimple size={16} aria-hidden />
          Apple (.ics)
        </button>
        <a
          className={linkClass}
          href={yahooCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Add deposit reminder to Yahoo Calendar (set recurrence manually)"
        >
          <CalendarPlus size={16} aria-hidden />
          Yahoo
        </a>
      </div>

      <Caption className="text-surface-grey mt-3 block">
        Outlook and Yahoo links create a single event — set the {cadence}{" "}
        recurrence there manually.
      </Caption>
    </Card>
  );
}
