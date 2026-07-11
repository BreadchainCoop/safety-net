"use client";

import { useEffect, useRef } from "react";
import { Footer } from "@breadcoop/ui";
import { BASE_PATH } from "@/lib/config";

/**
 * Breadchain solidarity footer (client component — uses phosphor icons).
 *
 * The kit Footer hardcodes two social icons as root-absolute <img> tags
 * (`/paragraph.png`, `/farcaster-icon.png`) with no prop to override them.
 * Under our GitHub Pages base path (/safety-net) those resolve to the domain
 * root and 404 — Next only rewrites its own asset references, not string paths
 * baked into a third-party component. We ship the PNGs in public/ (served at
 * `${BASE_PATH}/…`) and repoint any root-absolute footer <img> after mount.
 */
export function SiteFooter() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!BASE_PATH || !ref.current) return;
    for (const img of ref.current.querySelectorAll("img")) {
      const src = img.getAttribute("src");
      if (src && src.startsWith("/") && !src.startsWith(`${BASE_PATH}/`)) {
        img.setAttribute("src", `${BASE_PATH}${src}`);
      }
    }
  }, []);

  return (
    <div ref={ref} className="mt-auto">
      <Footer mode="transparent" className="section-container" />
    </div>
  );
}
