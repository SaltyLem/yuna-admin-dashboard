import type { ReactNode } from "react";
import {
  HomeIcon,
  VideoIcon,
  CoinsIcon,
  BrainIcon,
  SettingsIcon,
} from "./icons";

export interface NavChild {
  href: string;
  label: string;
  children?: NavChild[];
}

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  children?: NavChild[];
}

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: <HomeIcon /> },
  {
    href: "/stream",
    label: "Stream",
    icon: <VideoIcon />,
    children: [
      { href: "/stream/schedule", label: "Schedule" },
      { href: "/stream/programs", label: "Programs" },
      { href: "/stream/comments", label: "Comments" },
      { href: "/stream/history", label: "History" },
      { href: "/stream/auto-play", label: "Auto Play" },
    ],
  },
  {
    href: "/trade",
    label: "Trade",
    icon: <CoinsIcon />,
    children: [
      { href: "/trade/rules", label: "Rules" },
      { href: "/trade/positions", label: "Positions" },
      { href: "/trade/wallets", label: "Wallets" },
    ],
  },
  {
    href: "/yuna",
    label: "YUNA",
    icon: <BrainIcon />,
    children: [
      { href: "/yuna/goals", label: "Goals" },
      { href: "/yuna/thoughts", label: "Thoughts" },
      {
        href: "/yuna/memory",
        label: "Memory",
        children: [
          { href: "/yuna/memory/situations", label: "Situations" },
          { href: "/yuna/memory/episodes", label: "Episodes" },
          { href: "/yuna/memory/event-specific", label: "Event-specific" },
        ],
      },
    ],
  },
  { href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];
