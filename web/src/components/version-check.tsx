"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise, X } from "@phosphor-icons/react";
import { BASE_PATH } from "@/lib/config";

/** How often to re-check the deployed build id (ms). */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Baked into the bundle at build time (github.sha in CI). When the deployed
 * build-id.txt differs from this, the loaded bundle is stale.
 */
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

async function fetchDeployedId(): Promise<string | null> {
  try {
    // Cache-bust so a CDN/browser cache can't mask a fresh deploy — the whole
    // point is to detect a bundle the cache is otherwise still serving.
    const res = await fetch(`${BASE_PATH}/build-id.txt?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

/**
 * Static export has no built-in version signal, so users get stuck on a cached
 * bundle after a deploy (this bit us twice). Poll the deployed build-id.txt and,
 * when it no longer matches the bundle we're running, offer a one-tap refresh.
 * No-ops in dev / when BUILD_ID isn't set (nothing to compare against).
 */
export function VersionCheck() {
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!BUILD_ID) return;
    let active = true;

    const check = async () => {
      const deployed = await fetchDeployedId();
      if (active && deployed && deployed !== BUILD_ID) setStale(true);
    };

    check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    // Re-check when the tab regains focus (users leave it open for days).
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stale || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="section-container flex flex-col gap-2 pt-4"
    >
      <div className="border-primary-jade/40 bg-primary-jade/10 text-primary-jade flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm font-medium">
        <span className="inline-flex items-center gap-2">
          <ArrowClockwise size={16} weight="bold" className="shrink-0" />
          <span>
            A new version of the app is available.{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-bold underline underline-offset-2"
            >
              Refresh to update
            </button>
            .
          </span>
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="shrink-0 opacity-70 hover:opacity-100"
        >
          <X size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
