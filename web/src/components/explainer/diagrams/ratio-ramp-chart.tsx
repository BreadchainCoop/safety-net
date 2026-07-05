import { groupRatioCap, MAX_REDEEM_RATIO } from "@/lib/config";

/**
 * Inline SVG of the sustainable support-ratio cap vs. group size — the exact
 * on-chain `groupRatioCap(N)` curve (config.ts). Shows why bigger groups can
 * safely back a higher ratio (law of large numbers). A dashed marker at the
 * chosen `ratio` shows where a group first fully sustains it. viewBox +
 * preserveAspectRatio → responsive, no width math, no chart lib.
 */
export function RatioRampChart({
  ratio = 22,
  highlightN,
}: {
  ratio?: number;
  highlightN?: number;
}) {
  const W = 320;
  const H = 160;
  const padL = 28;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const minN = 2;
  const maxN = 50;
  const maxY = MAX_REDEEM_RATIO; // 25

  const x = (n: number) =>
    padL + ((n - minN) / (maxN - minN)) * (W - padL - padR);
  const y = (r: number) => padT + (1 - r / maxY) * (H - padT - padB);

  const pts: string[] = [];
  for (let n = minN; n <= maxN; n++) pts.push(`${x(n)},${y(groupRatioCap(n))}`);
  const points = pts.join(" ");

  // Smallest group size whose sustainable cap reaches the chosen ratio.
  let sustainsAt: number | null = null;
  for (let n = minN; n <= maxN; n++) {
    if (groupRatioCap(n) >= ratio) {
      sustainsAt = n;
      break;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      role="img"
      aria-label={`Sustainable support ratio rises with group size, approaching ×${MAX_REDEEM_RATIO} for large groups`}
    >
      {/* axes */}
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--color-paper-2, #e5e0d3)" strokeWidth="1" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--color-paper-2, #e5e0d3)" strokeWidth="1" />
      {/* y ticks: 1, 11, 22 */}
      {[1, 11, 22].map((r) => (
        <g key={r}>
          <text x={padL - 6} y={y(r) + 3} textAnchor="end" fontSize="8" fill="var(--color-surface-grey, #8a8577)">
            ×{r}
          </text>
        </g>
      ))}
      {/* x ticks */}
      {[2, 25, 50].map((n) => (
        <text key={n} x={x(n)} y={H - padB + 12} textAnchor="middle" fontSize="8" fill="var(--color-surface-grey, #8a8577)">
          {n}
        </text>
      ))}
      <text x={(W + padL) / 2} y={H - 2} textAnchor="middle" fontSize="8" fill="var(--color-surface-grey, #8a8577)">
        group size (members)
      </text>
      {/* target ratio line */}
      <line
        x1={padL}
        y1={y(ratio)}
        x2={W - padR}
        y2={y(ratio)}
        stroke="var(--color-primary-jade, #286b63)"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.5"
      />
      <text x={W - padR} y={y(ratio) - 3} textAnchor="end" fontSize="8" fill="var(--color-primary-jade, #286b63)">
        ×{ratio} configured
      </text>
      {/* the cap curve */}
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-primary-jade, #286b63)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* marker where the group first sustains the chosen ratio */}
      {sustainsAt !== null && (
        <circle cx={x(sustainsAt)} cy={y(ratio)} r="3.5" fill="var(--color-primary-jade, #286b63)" />
      )}
      {highlightN !== undefined && highlightN >= minN && highlightN <= maxN && (
        <circle
          cx={x(highlightN)}
          cy={y(groupRatioCap(highlightN))}
          r="4"
          fill="var(--color-paper-0, #fff)"
          stroke="var(--color-primary-jade, #286b63)"
          strokeWidth="2"
        />
      )}
    </svg>
  );
}
