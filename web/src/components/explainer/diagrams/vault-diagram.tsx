import { Body } from "@breadcoop/ui";

/**
 * The shared pool as stacked member deposits: individual "your slice stays
 * yours" bars inside one pool, with the total labelled "× support ratio".
 * Dependency-free inline SVG. Illustrative (fixed members), not live data.
 */
export function VaultDiagram() {
  const members = [
    { label: "You", h: 46 },
    { label: "", h: 46 },
    { label: "", h: 46 },
    { label: "", h: 46 },
  ];
  const barW = 40;
  const gap = 10;
  const startX = 24;
  const baseY = 120;

  return (
    <svg
      viewBox="0 0 320 170"
      preserveAspectRatio="xMidYMid meet"
      className="w-full max-w-xs"
      role="img"
      aria-label="Each member's deposit stacks into one shared pool; your slice stays yours"
    >
      {/* pool container */}
      <rect
        x="12"
        y="18"
        width="230"
        height="120"
        rx="12"
        fill="var(--color-primary-jade, #286b63)"
        opacity="0.06"
        stroke="var(--color-primary-jade, #286b63)"
        strokeOpacity="0.3"
      />
      <text x="127" y="34" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--color-primary-jade, #286b63)">
        Shared pool
      </text>
      {members.map((m, i) => {
        const x = startX + i * (barW + gap);
        return (
          <g key={i}>
            <rect
              x={x}
              y={baseY - m.h}
              width={barW}
              height={m.h}
              rx="4"
              fill="var(--color-primary-jade, #286b63)"
              opacity={i === 0 ? 0.85 : 0.4}
            />
            {m.label && (
              <text x={x + barW / 2} y={baseY - m.h - 4} textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--color-primary-jade, #286b63)">
                {m.label}
              </text>
            )}
          </g>
        );
      })}
      <text x="127" y="132" textAnchor="middle" fontSize="8" fill="var(--color-surface-grey, #8a8577)">
        everyone&apos;s deposits
      </text>
      {/* multiplier arrow to support */}
      <text x="270" y="70" textAnchor="middle" fontSize="18" fontWeight="800" fill="var(--color-primary-jade, #286b63)">
        →
      </text>
      <text x="286" y="60" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--color-primary-jade, #286b63)">
        × ratio
      </text>
      <text x="286" y="82" textAnchor="middle" fontSize="8" fill="var(--color-surface-grey, #8a8577)">
        support
      </text>
    </svg>
  );
}

export function VaultDiagramCaption() {
  return (
    <Body className="text-surface-grey mt-2 text-center text-xs">
      Everyone&apos;s deposits form one pool. Your balance is tracked as yours —
      withdraw it any time — while the pool stands ready to back whoever needs
      support this month.
    </Body>
  );
}
