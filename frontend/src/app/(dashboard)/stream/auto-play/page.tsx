"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/components/use-api";

interface Viewer { id: number; name: string; author_channel_id: string; location: string; }
interface Reaction { id: number; location: string; text: string; }
interface Config { enabled: boolean; mode: string; channel: string; activeViewerCount: number; reactionProbability: number; quickReactionRatio: number; minDelay: number; maxDelay: number; }

export default function AutoPlayPage() {
  const [config, setConfig] = useState<Config>({ enabled: false, mode: "live", channel: "ja", activeViewerCount: 20, reactionProbability: 0.3, quickReactionRatio: 0.6, minDelay: 5, maxDelay: 30 });
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [viewerTotal, setViewerTotal] = useState(0);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerFilter, setViewerFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reactionFilter, setReactionFilter] = useState("ja");
  const [genCount, setGenCount] = useState(100);
  const [genLoc, setGenLoc] = useState<"ja" | "en">("ja");
  const [newReaction, setNewReaction] = useState("");

  const loadConfig = useCallback(async () => {
    const c = await apiFetch<Config>("/additional-auto-play/config");
    setConfig(c);
  }, []);

  const loadViewers = useCallback(async () => {
    const q = viewerFilter ? "&location=" + viewerFilter : "";
    const data = await apiFetch<{ viewers: Viewer[]; total: number }>("/additional-auto-play/viewers?page=" + viewerPage + "&limit=50" + q);
    setViewers(data.viewers);
    setViewerTotal(data.total);
    setSelectedIds(new Set());
  }, [viewerPage, viewerFilter]);

  const loadReactions = useCallback(async () => {
    const data = await apiFetch<{ reactions: Reaction[] }>("/additional-auto-play/reactions?location=" + reactionFilter);
    setReactions(data.reactions);
  }, [reactionFilter]);

  useEffect(() => { void loadConfig(); }, [loadConfig]);
  useEffect(() => { void loadViewers(); }, [loadViewers]);
  useEffect(() => { void loadReactions(); }, [loadReactions]);

  const saveConfig = async (update: Partial<Config>) => {
    const next = { ...config, ...update };
    setConfig(next);
    await apiFetch("/additional-auto-play/config", { method: "POST", body: JSON.stringify(next) });
  };

  const generate = async () => {
    await apiFetch("/additional-auto-play/viewers/generate", { method: "POST", body: JSON.stringify({ count: genCount, location: genLoc }) });
    void loadViewers();
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    await apiFetch("/additional-auto-play/viewers", { method: "DELETE", body: JSON.stringify({ ids: [...selectedIds] }) });
    void loadViewers();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === viewers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(viewers.map((v) => v.id)));
  };

  const addReaction = async () => {
    if (!newReaction) return;
    await apiFetch("/additional-auto-play/reactions", { method: "POST", body: JSON.stringify({ location: reactionFilter, text: newReaction }) });
    setNewReaction("");
    void loadReactions();
  };

  const deleteReaction = async (id: number) => {
    await apiFetch("/additional-auto-play/reactions", { method: "DELETE", body: JSON.stringify({ ids: [id] }) });
    void loadReactions();
  };

  const totalPages = Math.ceil(viewerTotal / 50);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Additional Auto Play</h2>

      {/* Config */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-neutral-400">Settings</h3>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={config.enabled} onChange={(e) => void saveConfig({ enabled: e.target.checked })} className="rounded" />
            Enabled
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Mode</span>
            <select value={config.mode} onChange={(e) => void saveConfig({ mode: e.target.value })} className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm">
              <option value="live">Live only</option><option value="always">Always</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Channel</span>
            <select value={config.channel} onChange={(e) => void saveConfig({ channel: e.target.value })} className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm">
              <option value="ja">JA</option><option value="en">EN</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Active</span>
            <input type="number" value={config.activeViewerCount} onChange={(e) => void saveConfig({ activeViewerCount: parseInt(e.target.value) || 20 })} className="w-16 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm" min={1} max={200} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">React %</span>
            <input type="number" value={Math.round(config.reactionProbability * 100)} onChange={(e) => void saveConfig({ reactionProbability: (parseInt(e.target.value) || 30) / 100 })} className="w-16 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm" min={0} max={100} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Quick %</span>
            <input type="number" value={Math.round(config.quickReactionRatio * 100)} onChange={(e) => void saveConfig({ quickReactionRatio: (parseInt(e.target.value) || 60) / 100 })} className="w-16 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm" min={0} max={100} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Delay</span>
            <input type="number" value={config.minDelay} onChange={(e) => void saveConfig({ minDelay: parseInt(e.target.value) || 5 })} className="w-14 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm" min={1} />
            <span className="text-neutral-600">-</span>
            <input type="number" value={config.maxDelay} onChange={(e) => void saveConfig({ maxDelay: parseInt(e.target.value) || 30 })} className="w-14 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm" min={1} />
            <span className="text-xs text-neutral-500">sec</span>
          </div>
        </div>
      </div>

      {/* Viewers */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-400">Virtual Viewers ({viewerTotal})</h3>
          <div className="flex items-center gap-2">
            <select value={viewerFilter ?? "all"} onChange={(e) => { setViewerFilter(e.target.value === "all" ? null : e.target.value); setViewerPage(1); }} className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm">
              <option value="all">All</option><option value="ja">JA</option><option value="en">EN</option>
            </select>
            <input type="number" value={genCount} onChange={(e) => setGenCount(parseInt(e.target.value) || 100)} className="w-16 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm" min={1} />
            <select value={genLoc} onChange={(e) => setGenLoc(e.target.value as "ja" | "en")} className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm">
              <option value="ja">JA</option><option value="en">EN</option>
            </select>
            <button onClick={generate} className="px-3 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm hover:bg-neutral-700 transition">Generate</button>
            {selectedIds.size > 0 && (
              <button onClick={deleteSelected} className="px-3 py-1 bg-red-900/50 border border-red-800/50 rounded text-sm text-red-300 hover:bg-red-900 transition">Delete ({selectedIds.size})</button>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead><tr className="text-neutral-500 text-xs">
            <th className="w-8 py-1"><input type="checkbox" onChange={toggleAll} checked={selectedIds.size === viewers.length && viewers.length > 0} /></th>
            <th className="text-left py-1">Name</th>
            <th className="text-left py-1">Channel ID</th>
            <th className="w-12 py-1">Loc</th>
          </tr></thead>
          <tbody>
            {viewers.map((v) => (
              <tr key={v.id} className="border-t border-neutral-800/50 hover:bg-neutral-800/30">
                <td className="py-1 text-center"><input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} /></td>
                <td className="py-1">{v.name}</td>
                <td className="py-1 text-neutral-500 font-mono text-xs">{v.author_channel_id}</td>
                <td className="py-1 text-center"><span className={v.location === "ja" ? "text-red-400" : "text-blue-400"}>{v.location.toUpperCase()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button onClick={() => setViewerPage(Math.max(1, viewerPage - 1))} disabled={viewerPage <= 1} className="px-2 py-1 text-sm text-neutral-400 hover:text-white disabled:opacity-30">&lt;</button>
            <span className="text-sm text-neutral-400">{viewerPage} / {totalPages}</span>
            <button onClick={() => setViewerPage(Math.min(totalPages, viewerPage + 1))} disabled={viewerPage >= totalPages} className="px-2 py-1 text-sm text-neutral-400 hover:text-white disabled:opacity-30">&gt;</button>
          </div>
        )}
      </div>

      {/* Reactions */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-400">Quick Reactions</h3>
          <div className="flex gap-1 bg-neutral-800 rounded p-0.5">
            {["ja", "en"].map((l) => (
              <button key={l} onClick={() => setReactionFilter(l)} className={("px-3 py-1 rounded text-sm transition ") + (reactionFilter === l ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white")}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {reactions.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-800 rounded text-sm">
              {r.text}
              <button onClick={() => void deleteReaction(r.id)} className="text-neutral-600 hover:text-red-400 text-xs">x</button>
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <input type="text" value={newReaction} onChange={(e) => setNewReaction(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addReaction(); }} placeholder="Add reaction..." className="flex-1 px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm placeholder-neutral-600" />
          <button onClick={() => void addReaction()} className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm hover:bg-neutral-700 transition">Add</button>
        </div>
      </div>
    </div>
  );
}
