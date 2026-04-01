import "./globals.css";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import ModalPresenter from "@/components/modal/presenter";
import Providers from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Safety Net",
  description: "Mutual aid fund for peer-to-peer insurance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/@rainbow-me/rainbowkit@latest/styles.css"
        />
      </head>
      <body className="font-roboto text-text-standard antialiased">
        <div className="body-container">
          <Providers>
            <ModalPresenter />
            <Navbar />
            <main className="page-layout py-8">{children}</main>
            <Footer />
          </Providers>
        </div>
      </body>
    </html>
  );
}
