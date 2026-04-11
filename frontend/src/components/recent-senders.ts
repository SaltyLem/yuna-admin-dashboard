const STORAGE_KEY = "stream:recentSenders";
const MAX_ENTRIES = 20;

export interface RecentSender {
  user: string;
  authorChannelId: string;
}

export function getRecentSenders(): RecentSender[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentSender[]) : [];
  } catch {
    return [];
  }
}

export function addRecentSender(sender: RecentSender): void {
  const list = getRecentSenders().filter((s) => s.authorChannelId !== sender.authorChannelId);
  list.unshift(sender);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
}
