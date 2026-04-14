"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV, type NavItem } from "./nav-config";
import { LogoutIcon } from "./icons";

export interface SidebarProps {
  open?: boolean;
}

/**
 * Collapsible nav rail.
 * - Collapsed (64px): icons only, children hidden
 * - Expanded (224px): icons + labels; children shown indented when parent section is active
 */
export function Sidebar({ open = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isExact = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href;

  const isInSection = (item: NavItem) =>
    item.href === "/"
      ? pathname === "/"
      : pathname === item.href || pathname.startsWith(item.href + "/");

  const logout = () => {
    localStorage.removeItem("admin_token");
    document.cookie = "admin_token=; path=/; max-age=0";
    router.push("/login");
  };

  return (
    <aside
      className={`shrink-0 flex flex-col py-4 gap-2 border-r border-border transition-[width] duration-200 ease-out ${
        open ? "w-56" : "w-16"
      }`}
    >
      <nav className={`flex-1 flex flex-col gap-1 ${open ? "px-3" : "items-center"}`}>
        {NAV.map((item) => {
          const sectionActive = isInSection(item);
          const exactActive = isExact(item.href);
          const showChildren = open && item.children && sectionActive;

          return (
            <div key={item.href} className={open ? "w-full" : undefined}>
              <Link
                href={item.href}
                aria-label={item.label}
                title={open ? undefined : item.label}
                className={[
                  "group relative flex items-center rounded-xl transition",
                  open ? "h-11 w-full px-3 gap-3" : "h-11 w-11 justify-center",
                  exactActive || (!open && sectionActive)
                    ? "bg-accent-muted text-accent"
                    : "text-text-muted hover:text-text hover:bg-panel",
                ].join(" ")}
              >
                <span className="flex items-center justify-center shrink-0">
                  {item.icon}
                </span>
                <span
                  className={`text-sm font-medium whitespace-nowrap transition-opacity duration-150 ${
                    open ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
                  }`}
                >
                  {item.label}
                </span>
                {sectionActive && !open && (
                  <span
                    className="absolute -left-2 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-accent"
                    aria-hidden
                  />
                )}
              </Link>

              {showChildren && (
                <div className="mt-0.5 mb-1 ml-5 pl-4 border-l border-border flex flex-col gap-0.5">
                  {item.children!.map((child) => {
                    const childActive = isExact(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`flex items-center h-8 px-2 rounded-md text-sm whitespace-nowrap transition ${
                          childActive
                            ? "text-accent"
                            : "text-text-muted hover:text-text"
                        }`}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={open ? "px-3" : "flex justify-center"}>
        <button
          onClick={logout}
          aria-label="Logout"
          title={open ? undefined : "Logout"}
          className={[
            "flex items-center rounded-xl transition text-text-muted hover:text-text hover:bg-panel cursor-pointer",
            open ? "h-11 w-full px-3 gap-3" : "h-11 w-11 justify-center",
          ].join(" ")}
        >
          <span className="flex items-center justify-center shrink-0">
            <LogoutIcon />
          </span>
          <span
            className={`text-sm font-medium whitespace-nowrap transition-opacity duration-150 ${
              open ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
            }`}
          >
            Logout
          </span>
        </button>
      </div>
    </aside>
  );
}
