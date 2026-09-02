"use client";

import { usePathname } from "next/navigation";
import { Nav } from "./nav";

export function NavWrapper() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <Nav />;
}
