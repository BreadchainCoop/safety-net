"use client";

import { Navbar as LibNavbar } from "@breadcoop/ui";
import Link from "next/link";

export function Navbar() {
  return (
    <LibNavbar
      app="net"
      className="page-layout relative z-30"
    >
      <nav className="flex flex-col gap-2 md:flex-row md:gap-4 md:mr-8">
        <Link href="/" className="text-body">
          Dashboard
        </Link>
        <Link href="/browse" className="text-body">
          Browse
        </Link>
        <Link href="/new" className="text-body">
          Create Fund
        </Link>
      </nav>
    </LibNavbar>
  );
}
