"use client";

import { useState, useRef, useEffect } from "react";
import { apiFetch } from "./use-api";

interface PersonIdentity {
  platform: string;
  platformUid: string;
}

interface Person {
  id: string;
  primaryName: string;
  nickname: string | null;
  identities: PersonIdentity[];
}

interface PersonPickerProps {
  onSelect: (user: string, authorChannelId: string) => void;
  onClose: () => void;
}

export function PersonPicker({ onSelect, onClose }: PersonPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch<{ persons: Person[] }>(`/persons/search?q=${encodeURIComponent(q)}`);
        setResults(data.persons);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300);
  };

  const handleSelect = (p: Person) => {
    const ytIdentity = p.identities.find((i) => i.platform === "youtube");
    const channelId = ytIdentity?.platformUid ?? `x_${p.id.slice(0, 8)}`;
    onSelect(p.nickname ?? p.primaryName, channelId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel border border-border rounded-lg w-96 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
            placeholder="Search by name or ID..."
            className="w-full px-3 py-2 bg-panel-2 border border-border-strong rounded text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading && <p className="text-text-muted text-sm text-center py-4">Searching...</p>}
          {!loading && results.length === 0 && query.length >= 2 && (
            <p className="text-text-muted text-sm text-center py-4">No results</p>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className="w-full text-left px-3 py-2 rounded hover:bg-panel-2 transition text-sm"
            >
              <div className="text-text">{p.nickname ?? p.primaryName}</div>
              <div className="text-text-muted text-xs">
                {p.identities.map((i) => `${i.platform}: ${i.platformUid.slice(0, 12)}`).join(", ") || "no identities"}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
