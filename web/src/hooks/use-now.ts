"use client";

import { useEffect, useState } from "react";

/** Ticking unix-seconds clock for countdowns and epoch progress. */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      intervalMs,
    );
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
