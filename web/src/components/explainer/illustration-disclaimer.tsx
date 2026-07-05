import { NoteBox } from "@/components/ui/note-box";

/**
 * The required "Illustration, not a promise" disclaimer, placed next to any
 * projected support figure (calculator, fund-health, create page). Exported so
 * every surface that shows a projection carries the identical caveat.
 */
export function IllustrationDisclaimer() {
  return (
    <NoteBox icon>
      <strong className="text-text-standard">
        Illustration, not a promise.
      </strong>{" "}
      These figures show how the support ratio <em>could</em> work for a group
      like this — it&apos;s the same math the contract uses — but real support
      depends on your pool&apos;s actual balance, your group&apos;s size, and how
      many members need help at once. Your <em>effective</em> ratio ramps up as
      the pool fills, and no payout is guaranteed. Nothing here is financial
      advice.
    </NoteBox>
  );
}
