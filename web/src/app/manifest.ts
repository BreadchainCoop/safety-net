import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/metadata";

// Required for `output: export` — emit a static manifest.webmanifest at build.
export const dynamic = "force-static";

/**
 * PWA web manifest (Next metadata route → static `manifest.webmanifest`, and
 * the <link rel="manifest"> is injected automatically). Icon `src` and
 * `start_url` are RELATIVE so they resolve under the deployed base path
 * (/safety-net/…) without hardcoding it — the manifest itself is served under
 * that prefix, and the app icons live at `${basePath}/icon.png` etc.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Safety Net — group savings on Gnosis",
    short_name: SITE_NAME,
    description:
      "Group savings with a social safety net — pooled deposits, mutual accountability, and community-approved withdrawals on Gnosis Chain.",
    start_url: ".",
    display: "standalone",
    background_color: "#f6f3eb",
    theme_color: "#286b63",
    icons: [
      { src: "icon.png", sizes: "any", type: "image/png", purpose: "any" },
      { src: "apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
