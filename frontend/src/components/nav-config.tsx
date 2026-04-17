import type { ReactNode } from "react";
import {
  HomeIcon,
  VideoIcon,
  CoinsIcon,
  BrainIcon,
  SettingsIcon,
  ChatIcon,
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
      { href: "/yuna/state", label: "Current state" },
      { href: "/yuna/goals", label: "Goals" },
      { href: "/yuna/immediate-rules", label: "Immediate rules" },
      { href: "/yuna/hypotheses", label: "Hypotheses" },
      { href: "/yuna/thoughts", label: "Thoughts" },
      { href: "/yuna/pending-actions", label: "Pending actions" },
      { href: "/yuna/persons", label: "Persons" },
      { href: "/yuna/drives", label: "Drives" },
      { href: "/yuna/interests-engagement", label: "Interests" },
      { href: "/yuna/research-findings", label: "Research findings" },
      { href: "/yuna/cycle-blocks", label: "Cycle blocks" },
      { href: "/yuna/api-usage", label: "API usage" },
      {
        href: "/yuna/memory",
        label: "Memory",
        children: [
          { href: "/yuna/memory/events", label: "Events" },
          { href: "/yuna/memory/situations", label: "Situations" },
          { href: "/yuna/memory/episodes", label: "Episodes" },
          { href: "/yuna/memory/event-specific", label: "Event-specific" },
          { href: "/yuna/memory/general-events", label: "General events" },
          { href: "/yuna/memory/semantic-facts", label: "Semantic facts" },
        ],
      },
    ],
  },
  {
    href: "/chat",
    label: "Chat",
    icon: <ChatIcon />,
    children: [
      { href: "/chat/ollama", label: "Ollama" },
    ],
  },
  { href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];
