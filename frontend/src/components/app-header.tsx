"use client";

import { SearchIcon, BellIcon, PlusIcon, MenuIcon } from "./icons";

export interface AppHeaderProps {
  onMenuClick?: () => void;
}

/**
 * Full-width top header.
 * Left: hamburger + brand. Right: quick actions + avatar.
 */
export function AppHeader({ onMenuClick }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 px-4 h-14 border-b border-border bg-bg">
      {/* Left */}
      <div className="flex items-center gap-3">
        <IconButton label="Toggle sidebar" onClick={onMenuClick}>
          <MenuIcon size={20} />
        </IconButton>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl tracking-[0.2em] uppercase text-accent">
            YUNA
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            admin
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="hidden sm:inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium text-accent bg-accent-muted hover:bg-accent/20 transition"
        >
          <PlusIcon size={16} />
          <span>Add</span>
        </button>
        <IconButton label="Search">
          <SearchIcon size={18} />
        </IconButton>
        <IconButton label="Notifications">
          <BellIcon size={18} />
        </IconButton>
        <div
          className="h-9 w-9 rounded-full bg-panel-2 border border-border-strong"
          aria-label="Account"
        />
      </div>
    </header>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex items-center justify-center h-9 w-9 rounded-full text-text-muted hover:text-text hover:bg-panel-hover transition cursor-pointer"
    >
      {children}
    </button>
  );
}
