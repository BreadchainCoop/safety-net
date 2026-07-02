import type { Metadata } from "next";
import { SITE_URL } from "@/lib/config";

/**
 * Shared metadata builder (app-stacks generateMetadata pattern, static-export
 * compatible): title template, OpenGraph + Twitter cards with the jade OG
 * image so shared links — especially /join invites — unfurl into rich cards.
 */

export const SITE_NAME = "Safety Net";
const DEFAULT_TITLE = "Safety Net — group savings on Gnosis";
const DEFAULT_DESCRIPTION =
  "Group savings with a social safety net — pooled deposits, mutual accountability, and community-approved withdrawals on Gnosis Chain.";

/** Absolute URL under the deployed site (SITE_URL includes any base path). */
const absolute = (path: string) =>
  `${SITE_URL.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

export function buildMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
}: {
  /** Route title; omitted → the site default + "%s — Safety Net" template. */
  title?: string;
  description?: string;
  /** Route path for the canonical og:url, e.g. "/join/". */
  path?: string;
} = {}): Metadata {
  const fullTitle = title ? `${title} — ${SITE_NAME}` : DEFAULT_TITLE;
  const image = {
    url: absolute("/og.png"),
    width: 1200,
    height: 630,
    alt: "Safety Net — group savings with a social safety net",
  };

  return {
    metadataBase: new URL(SITE_URL),
    title:
      title !== undefined
        ? title
        : { default: DEFAULT_TITLE, template: `%s — ${SITE_NAME}` },
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      url: absolute(path),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [image.url],
    },
  };
}
