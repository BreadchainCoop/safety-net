"use client";

import { useEffect, useRef, useState } from "react";
import { FilmSlate } from "@phosphor-icons/react";

/**
 * Renders /docs/gifs/<name>.gif if present, otherwise a graceful placeholder.
 * GIFs are recorded separately and dropped into web/public/docs/gifs/.
 */
export function GifSlot({ name, alt }: { name: string; alt: string }) {
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // The error event can fire before hydration (static export), so also check
  // the load state after mount.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setMissing(true);
  }, []);

  if (missing) {
    return (
      <div className="border-paper-2 bg-paper-1 text-surface-grey flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed">
        <FilmSlate size={28} />
        <span className="text-xs">
          Walkthrough GIF coming soon ({name}.gif)
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/docs/gifs/${name}.gif`}
      alt={alt}
      className="border-paper-2 w-full rounded-xl border"
      onError={() => setMissing(true)}
    />
  );
}
