"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

interface NavGroup {
  label: string;
  icon: string;
  href: string;
  children?: { href: string; label: string }[];
}

const NAV: NavGroup[] = [
  { label: "Overview", icon: "⬡", href: "/" },
  {
    label: "Stream", icon: "▶", href: "/stream",
    children: [
      { href: "/stream/schedule", label: "Schedule" },
      { href: "/stream/comments", label: "Comments" },
      { href: "/stream/history", label: "History" },
      { href: "/stream/programs", label: "Programs" },
    ],
  },
  {
    label: "Trade", icon: "◇", href: "/trade",
    children: [
      { href: "/trade/rules", label: "Rules" },
      { href: "/trade/positions", label: "Positions" },
      { href: "/trade/wallets", label: "Wallets" },
    ],
  },
  {
    label: "YUNA", icon: "◉", href: "/yuna",
    children: [
      { href: "/yuna/memory", label: "Memory" },
      { href: "/yuna/thoughts", label: "Thoughts" },
      { href: "/yuna/goals", label: "Goals" },
    ],
  },
  { label: "Settings", icon: "⚙", href: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of NAV) {
      if (g.children && pathname.startsWith(g.href)) init[g.href] = true;
    }
    return init;
  });

  const toggle = (href: string) =>
    setExpanded((prev) => ({ ...prev, [href]: !prev[href] }));

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href;

  const isGroupActive = (group: NavGroup) =>
    group.href === "/" ? pathname === "/" : pathname.startsWith(group.href);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    document.cookie = "admin_token=; path=/; max-age=0";
    router.push("/login");
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-neutral-900 border-r border-neutral-800 flex flex-col">
      <div className="px-5 py-5 border-b border-neutral-800">
        <h1 className="text-lg font-bold text-white tracking-tight">YUNA Admin</h1>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map((group) => (
          <div key={group.href}>
            {group.children ? (
              <>
                <button
                  onClick={() => toggle(group.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition ${
                    isGroupActive(group)
                      ? "text-white"
                      : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                  }`}
                >
                  <span className="text-base w-5 text-center">{group.icon}</span>
                  <span className="flex-1 text-left">{group.label}</span>
                  <span className={`text-xs text-neutral-500 transition-transform ${expanded[group.href] ? "rotate-90" : ""}`}>
                    ▸
                  </span>
                </button>
                {expanded[group.href] && (
                  <div className="ml-8 space-y-0.5 mt-0.5">
                    <Link
                      href={group.href}
                      className={`block px-3 py-1.5 rounded text-sm transition ${
                        isActive(group.href)
                          ? "bg-neutral-800 text-white"
                          : "text-neutral-500 hover:text-white hover:bg-neutral-800/50"
                      }`}
                    >
                      Overview
                    </Link>
                    {group.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`block px-3 py-1.5 rounded text-sm transition ${
                          isActive(child.href)
                            ? "bg-neutral-800 text-white"
                            : "text-neutral-500 hover:text-white hover:bg-neutral-800/50"
                        }`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Link
                href={group.href}
                className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition ${
                  isActive(group.href)
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                }`}
              >
                <span className="text-base w-5 text-center">{group.icon}</span>
                {group.label}
              </Link>
            )}
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-neutral-800">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded text-sm text-neutral-500 hover:text-white hover:bg-neutral-800/50 transition"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
