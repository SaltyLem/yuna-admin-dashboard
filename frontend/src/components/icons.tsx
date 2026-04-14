/**
 * Lightweight inline SVG icons.
 *
 * Kept in one file so swapping to an icon library later is a one-file change.
 * All icons share the same props so they're drop-in replaceable.
 */

type IconProps = {
  className?: string;
  size?: number;
};

function base({ className, size = 20 }: IconProps) {
  return {
    className,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function HomeIcon(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1v-8.5z" />
    </svg>
  );
}

export function VideoIcon(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3z" />
    </svg>
  );
}

export function CoinsIcon(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <circle cx="9" cy="9" r="5" />
      <path d="M15.5 6.5a5 5 0 0 1 0 9" />
      <path d="M18 4.5a5 5 0 0 1 0 15" />
    </svg>
  );
}

export function BrainIcon(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M9 4a3 3 0 0 0-3 3v1.5A3 3 0 0 0 4 11v2a3 3 0 0 0 2 2.83V17a3 3 0 0 0 3 3h0V4z" />
      <path d="M15 4a3 3 0 0 1 3 3v1.5A3 3 0 0 1 20 11v2a3 3 0 0 1-2 2.83V17a3 3 0 0 1-3 3h0V4z" />
    </svg>
  );
}

export function SettingsIcon(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function SearchIcon(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function BellIcon(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function PlusIcon(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MenuIcon(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function LogoutIcon(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
