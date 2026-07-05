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
        An illustration, not a promise.
      </strong>{" "}
      This shows how much a group like this <em>could</em> support someone — but
      real support depends on how full your pool is, how big your circle is, and
      how many people need help at once. A new net supports smaller amounts and
      grows over time, and no payout is guaranteed. Nothing here is financial
      advice.
    </NoteBox>
  );
}
