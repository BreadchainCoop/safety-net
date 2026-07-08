"use client";

import { useMemo } from "react";
import encodeQR from "@paulmillr/qr";

/**
 * Renders `value` as a QR code, generated entirely in-browser (@paulmillr/qr,
 * audited + dependency-free) so sensitive data — like an invite link's join
 * signature — is never sent to a QR image service. The boolean module matrix is
 * drawn as one SVG <path> (a rect per dark module bloats the DOM), with the
 * quiet-zone border baked in and crisp edges for reliable scanning.
 */
export function QrCode({
  value,
  size = 160,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const { path, dim } = useMemo(() => {
    const matrix = encodeQR(value, "raw", { border: 2, ecc: "medium" });
    const n = matrix.length;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (matrix[y][x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { path: d, dim: n };
  }, [value]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for this invite link"
      className={className}
    >
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
