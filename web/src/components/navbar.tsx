"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Logo } from "@breadcoop/ui";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "My Safety Nets" },
  { href: "/create", label: "Create" },
  { href: "/docs", label: "Docs" },
];

function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-primary-jade/10 text-primary-jade font-bold"
                : "text-surface-grey-2 hover:text-text-standard",
              className,
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}

/** Sticky jade-branded header with nav links and the wallet button. */
export function Navbar() {
  return (
    <header className="border-paper-2 bg-paper-main/80 sticky top-0 z-50 border-b backdrop-blur">
      <nav className="section-container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo variant="square" color="jade" size={28} />
          <span className="font-breadDisplay text-text-standard hidden text-lg font-bold sm:block">
            Safety Net
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <NavLinks />
        </div>

        <ConnectButton
          showBalance={false}
          accountStatus="address"
          chainStatus="icon"
        />
      </nav>

      {/* Mobile nav */}
      <div className="border-paper-2 flex gap-1 overflow-x-auto border-t px-4 py-2 md:hidden">
        <NavLinks />
      </div>
    </header>
  );
}
