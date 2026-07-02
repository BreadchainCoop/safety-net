"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDisconnect } from "wagmi";
import { Navbar as KitNavbar, Button } from "@breadcoop/ui";
import { SignOut } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "My Safety Nets" },
  { href: "/create", label: "Create" },
  { href: "/docs", label: "Docs" },
];

function NavLinks() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="flex flex-col gap-2 md:mr-6 md:flex-row md:items-center md:gap-1"
    >
      {LINKS.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-primary-jade/10 text-primary-jade font-bold"
                : "text-surface-grey-2 hover:text-text-standard",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Disconnect action rendered inside the kit account menu. */
function AccountActions() {
  const { disconnect } = useDisconnect();
  return (
    <Button
      app="net"
      variant="secondary"
      className="w-full"
      rightIcon={<SignOut />}
      onClick={() => disconnect()}
    >
      Disconnect
    </Button>
  );
}

/**
 * Official `@breadcoop/ui` Navbar (app="net"): Safety Net logo lockup, the
 * Breadchain solidarity-apps switcher, and the built-in mobile menu. Connect /
 * account UI comes from the kit's "general" (wagmi + RainbowKit) auth path.
 */
export function Navbar() {
  return (
    <header className="border-paper-2 bg-paper-main/80 sticky top-0 z-50 border-b backdrop-blur">
      <KitNavbar
        app="net"
        Link={Link}
        className="section-container"
        actionItems={<AccountActions />}
      >
        <NavLinks />
      </KitNavbar>
    </header>
  );
}
