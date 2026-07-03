/**
 * Dependency-free calendar-link builders for recurring deposit reminders.
 *
 * Ported from the app-stacks reminder utils: every provider gets a plain URL
 * (or, for Apple/ICS, a downloadable data blob) built entirely client-side —
 * no credentials, no network calls. The recurrence is expressed as an iCal
 * RRULE derived from the net's epoch length; Google and ICS honour it, while
 * Outlook and Yahoo have no URL-level recurrence support (documented below).
 */

export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** e.g. 2 = every 2 weeks. Omitted/1 means every unit. */
  interval?: number;
}

export interface CalendarEvent {
  title: string;
  description: string;
  startTime: Date;
  /** Optional — defaults to startTime + 1 hour. */
  endTime?: Date;
  location?: string;
  recurrence?: RecurrenceRule;
  /** File name (without extension) for the ICS download. */
  fileName?: string;
}

export type CalendarProvider = "google" | "ics" | "outlook" | "yahoo";

/** Providers whose URL schemes cannot carry recurrence. */
export const RECURRENCE_UNSUPPORTED: CalendarProvider[] = ["outlook", "yahoo"];

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_WEEK = SECONDS_PER_DAY * 7;
// Calendar "months" are irregular; treat ~30 days as a month for cadence
// classification only (the RRULE still uses whole-month FREQ when it fits).
const SECONDS_PER_MONTH = SECONDS_PER_DAY * 30;
const SECONDS_PER_YEAR = SECONDS_PER_DAY * 365;

/**
 * Map an epoch length (in seconds) onto the closest sensible iCal recurrence.
 *
 * We snap to a whole FREQ when the interval is a near-exact multiple of a
 * calendar unit (weekly / monthly / yearly), otherwise fall back to a generic
 * DAILY rule with an INTERVAL in whole days so any cadence stays expressible.
 */
export function recurrenceFromEpochSeconds(
  epochSeconds: number,
): RecurrenceRule {
  const secs = Math.max(1, Math.round(epochSeconds));

  const nearMultiple = (unit: number): number | null => {
    const ratio = secs / unit;
    const rounded = Math.round(ratio);
    if (rounded < 1) return null;
    // within 5% of a whole multiple counts as "on the unit"
    return Math.abs(ratio - rounded) <= 0.05 ? rounded : null;
  };

  const years = nearMultiple(SECONDS_PER_YEAR);
  if (years) return { frequency: "YEARLY", interval: years };

  const months = nearMultiple(SECONDS_PER_MONTH);
  if (months) return { frequency: "MONTHLY", interval: months };

  const weeks = nearMultiple(SECONDS_PER_WEEK);
  if (weeks) return { frequency: "WEEKLY", interval: weeks };

  // Generic fallback: whole-day interval (minimum 1 day).
  const days = Math.max(1, Math.round(secs / SECONDS_PER_DAY));
  return { frequency: "DAILY", interval: days };
}

/** Human-readable cadence label, e.g. "every 2 weeks" / "every 3 days". */
export function describeCadence(epochSeconds: number): string {
  const rule = recurrenceFromEpochSeconds(epochSeconds);
  const n = rule.interval ?? 1;
  const unit = {
    DAILY: "day",
    WEEKLY: "week",
    MONTHLY: "month",
    YEARLY: "year",
  }[rule.frequency];
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
}

function resolveEndTime(event: CalendarEvent): Date {
  if (event.endTime) return event.endTime;
  const end = new Date(event.startTime);
  end.setHours(end.getHours() + 1);
  return end;
}

/** UTC "basic" format used by Google/ICS: 20260703T140500Z. */
function formatDateCompact(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Build an RRULE line, e.g. "RRULE:FREQ=WEEKLY;INTERVAL=2". */
export function buildRRule(rule: RecurrenceRule): string {
  const parts: string[] = [`FREQ=${rule.frequency}`];
  if (rule.interval && rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }
  return `RRULE:${parts.join(";")}`;
}

// ── Google Calendar ─────────────────────────────────────────────
// Recurrence carried via the `recur` param (full RRULE string).
export function googleCalendarUrl(event: CalendarEvent): string {
  const endTime = resolveEndTime(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    details: event.description,
    location: event.location ?? "",
    dates: `${formatDateCompact(event.startTime)}/${formatDateCompact(endTime)}`,
  });
  if (event.recurrence) params.set("recur", buildRRule(event.recurrence));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ── Outlook (web deep-link) ─────────────────────────────────────
// No recurrence support in the URL scheme.
export function outlookCalendarUrl(event: CalendarEvent): string {
  const endTime = resolveEndTime(event);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    body: event.description || "",
    startdt: event.startTime.toISOString(),
    enddt: endTime.toISOString(),
    location: event.location ?? "",
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

// ── Yahoo Calendar ──────────────────────────────────────────────
// No recurrence support in the URL scheme.
function yahooDuration(startTime: Date, endTime: Date): string {
  const durationMs = endTime.getTime() - startTime.getTime();
  const hours = Math.floor(durationMs / 3_600_000);
  const mins = Math.floor((durationMs % 3_600_000) / 60_000);
  return `${String(hours).padStart(2, "0")}${String(mins).padStart(2, "0")}`;
}

export function yahooCalendarUrl(event: CalendarEvent): string {
  const endTime = resolveEndTime(event);
  const params = new URLSearchParams({
    v: "60",
    title: event.title,
    desc: event.description,
    st: formatDateCompact(event.startTime),
    dur: yahooDuration(event.startTime, endTime),
    in_loc: event.location ?? "",
  });
  return `https://calendar.yahoo.com/?${params.toString()}`;
}

/** Escape a value for an iCal text field (commas, semicolons, newlines). */
function escapeICS(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Full ICS document string (with RRULE + a 30-minute reminder alarm). */
export function buildICS(event: CalendarEvent): string {
  const endTime = resolveEndTime(event);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Breadchain//SafetyNet//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@safetynet.breadchain`,
    `DTSTAMP:${formatDateCompact(new Date())}`,
    `DTSTART:${formatDateCompact(event.startTime)}`,
    `DTEND:${formatDateCompact(endTime)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    `DESCRIPTION:${escapeICS(event.description)}`,
    `LOCATION:${escapeICS(event.location ?? "")}`,
  ];
  if (event.recurrence) lines.push(buildRRule(event.recurrence));
  lines.push(
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeICS(event.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return lines.join("\r\n");
}

/** Trigger a client-side download of the event as an .ics file. */
export function downloadICS(event: CalendarEvent): void {
  const blob = new Blob([buildICS(event)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${event.fileName || "safety-net-deposit"}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}
