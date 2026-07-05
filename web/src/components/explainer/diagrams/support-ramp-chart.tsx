import { groupRatioCap } from "@/lib/config";

const short = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : Math.round(n).toString();

/**
 * Monthly support a group can back as it grows — the concrete, money-labelled
 * version of the group-size cap. support(N) = min(ratio, groupRatioCap(N)) ×
 * contribution, plotted against group size N = 2…50. A dashed line marks the
 * full promise (ratio × contribution). No ratios or formulas on the axes —
 * just "bigger circle → more support." Dependency-free inline SVG.
 */
export function SupportRampChart({
  ratio,
  contribution,
  symbol = "BREAD",
  highlightN,
}: {
  ratio: number;
  contribution: number;
  symbol?: string;
  highlightN?: number;
}) {
  const W = 320;
  const H = 170;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const minN = 2;
  const maxN = 50;
  const maxY = Math.max(1, ratio * contribution); // the full promise

  const x = (n: number) =>
    padL + ((n - minN) / (maxN - minN)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / maxY) * (H - padT - padB);
  const support = (n: number) =>
    Math.min(ratio, groupRatioCap(n)) * contribution;

  const pts: string[] = [];
  for (let n = minN; n <= maxN; n++) pts.push(`${x(n)},${y(support(n))}`);
  const points = pts.join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      role="img"
      aria-label={`Monthly support a group can back rises with group size, toward about ${short(maxY)} ${symbol} per month`}
    >
      {/* axes */}
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--color-paper-2, #e5e0d3)" strokeWidth="1" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--color-paper-2, #e5e0d3)" strokeWidth="1" />
      {/* y ticks: 0, half, full — in money */}
      {[0, maxY / 2, maxY].map((v, i) => (
        <text key={i} x={padL - 5} y={y(v) + 3} textAnchor="end" fontSize="8" fill="var(--color-surface-grey, #8a8577)">
          {short(v)}
        </text>
      ))}
      <text
        x={10}
        y={(H - padB + padT) / 2}
        textAnchor="middle"
        fontSize="8"
        fill="var(--color-surface-grey, #8a8577)"
        transform={`rotate(-90 10 ${(H - padB + padT) / 2})`}
      >
        support {symbol}/mo
      </text>
      {/* x ticks */}
      {[2, 25, 50].map((n) => (
        <text key={n} x={x(n)} y={H - padB + 12} textAnchor="middle" fontSize="8" fill="var(--color-surface-grey, #8a8577)">
          {n}
        </text>
      ))}
      <text x={(W + padL) / 2} y={H - 3} textAnchor="middle" fontSize="8" fill="var(--color-surface-grey, #8a8577)">
        people in your circle
      </text>
      {/* full-promise line */}
      <line x1={padL} y1={y(maxY)} x2={W - padR} y2={y(maxY)} stroke="var(--color-primary-jade, #286b63)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <text x={W - padR} y={y(maxY) + 10} textAnchor="end" fontSize="8" fill="var(--color-primary-jade, #286b63)">
        full support ≈ {short(maxY)} {symbol}
      </text>
      {/* the curve */}
      <polyline points={points} fill="none" stroke="var(--color-primary-jade, #286b63)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* marker at the chosen group size */}
      {highlightN !== undefined && highlightN >= minN && highlightN <= maxN && (
        <circle cx={x(highlightN)} cy={y(support(highlightN))} r="4" fill="var(--color-paper-0, #fff)" stroke="var(--color-primary-jade, #286b63)" strokeWidth="2" />
      )}
    </svg>
  );
}
