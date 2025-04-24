"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", shortcut: "d" },
  { label: "API Keys", path: "/dashboard/keys", shortcut: "k" },
  { label: "Usage", path: "/dashboard/usage", shortcut: "u" },
  { label: "Settings", path: "/dashboard/settings", shortcut: "s" },
];

export function TuiMobileNav() {
  const pathname = usePathname();
  
  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(path);
  };
  
  return (
    <div className="tui-mobile-nav md:hidden">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.path}
          href={item.path}
          className={`tui-mobile-nav-item ${isActive(item.path) ? 'active' : ''}`}
        >
          <div className="text-center">
            {isActive(item.path) ? `» ${item.label}` : item.label}
          </div>
          <div className="text-xs opacity-70 mt-1">[{item.shortcut}]</div>
        </Link>
      ))}
    </div>
  );
}

export default TuiMobileNav; 