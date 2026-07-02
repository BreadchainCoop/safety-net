import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { VerifyBanner } from "@/components/verify-banner";
import { NotificationBanner } from "@/components/notification-banner";
import { ConfigWarning } from "@/components/config-warning";
import { SiteFooter } from "@/components/site-footer";
import { buildMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildMetadata();

export const viewport: Viewport = {
  themeColor: "#286b63", // primary-jade
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Providers>
          <VerifyBanner />
          <Navbar />
          <ConfigWarning />
          <NotificationBanner />
          <main className="section-container flex-1 py-8">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
