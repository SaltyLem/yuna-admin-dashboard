import type { ReactNode } from "react";
import {
  HomeIcon,
  VideoIcon,
  CoinsIcon,
  BrainIcon,
  SettingsIcon,
  ChatIcon,
  LogIcon,
} from "./icons";

function GaugeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 14l3-5" />
      <circle cx="12" cy="14" r="8" />
      <path d="M4 14a8 8 0 0 1 16 0" />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11v3l11 4V7L3 11z" />
      <path d="M14 7l5-3v16l-5-3" />
      <path d="M8 14v5a2 2 0 0 0 4 0v-3" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 7h4M3 12h4M3 17h4M17 7h4M17 12h4M17 17h4" />
    </svg>
  );
}

function WorkerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

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
      { href: "/stream/reading-rules", label: "Reading rules" },
      { href: "/stream/history", label: "History" },
      { href: "/stream/auto-play", label: "Auto Play" },
      { href: "/stream/youtube-slot", label: "YouTube Slot" },
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
  { href: "/announcements", label: "Announcements", icon: <MegaphoneIcon /> },
  {
    href: "/video",
    label: "Video",
    icon: <FilmIcon />,
    children: [
      { href: "/video/queue", label: "Queue" },
      { href: "/video/sessions", label: "Sessions" },
      { href: "/video/posts", label: "Posts" },
      { href: "/video/questions", label: "Questions" },
    ],
  },
  {
    href: "/worker",
    label: "Worker",
    icon: <WorkerIcon />,
    children: [
      { href: "/worker/crawl", label: "Crawl (articles)" },
      { href: "/worker/crawl/sources", label: "Crawl sources" },
      { href: "/worker/tweets", label: "Tweets" },
      { href: "/worker/donations", label: "Donations" },
      { href: "/worker/engagement", label: "Video engagement" },
    ],
  },
  { href: "/metrics", label: "Metrics", icon: <GaugeIcon /> },
  { href: "/log", label: "Log", icon: <LogIcon /> },
  { href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];
