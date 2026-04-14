"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import {
  Field,
  Select,
  SegmentedControl,
  NumberInput,
  ToggleSwitch,
} from "@/components/ui";

interface Viewer {
  id: number;
  name: string;
  author_channel_id: string;
  location: string;
}

interface Reaction {
  id: number;
  location: string;
  text: string;
}

interface Config {
  enabled: boolean;
  mode: string;
  channel: string;
  activeViewerCount: number;
  reactionProbability: number;
  quickReactionRatio: number;
  minDelay: number;
  maxDelay: number;
}

const PAGE_SIZE = 50;

export default function AutoPlayPage() {
  const [config, setConfig] = useState<Config>({
    enabled: false,
    mode: "live",
    channel: "ja",
    activeViewerCount: 20,
    reactionProbability: 0.3,
    quickReactionRatio: 0.6,
    minDelay: 5,
    maxDelay: 30,
  });
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [viewerTotal, setViewerTotal] = useState(0);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerFilter, setViewerFilter] = useState<"all" | "ja" | "en">("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reactionFilter, setReactionFilter] = useState<"ja" | "en">("ja");
  const [newReaction, setNewReaction] = useState("");

  const loadConfig = useCallback(async () => {
    try {
      const c = await apiFetch<Config>("/additional-auto-play/config");
      setConfig(c);
    } catch { /* ignore */ }
  }, []);

  const loadViewers = useCallback(async () => {
    const q = viewerFilter !== "all" ? "&location=" + viewerFilter : "";
    try {
      const data = await apiFetch<{ viewers: Viewer[]; total: number }>(
        "/additional-auto-play/viewers?page=" + viewerPage + "&limit=" + PAGE_SIZE + q,
      );
      setViewers(data.viewers);
      setViewerTotal(data.total);
      setSelectedIds(new Set());
    } catch { /* ignore */ }
  }, [viewerPage, viewerFilter]);

  const loadReactions = useCallback(async () => {
    try {
      const data = await apiFetch<{ reactions: Reaction[] }>(
        "/additional-auto-play/reactions?location=" + reactionFilter,
      );
      setReactions(data.reactions);
    } catch { /* ignore */ }
  }, [reactionFilter]);

  useEffect(() => { void loadConfig(); }, [loadConfig]);
  useEffect(() => { void loadViewers(); }, [loadViewers]);
  useEffect(() => { void loadReactions(); }, [loadReactions]);

  const saveConfig = async (update: Partial<Config>) => {
    const next = { ...config, ...update };
    setConfig(next);
    try {
      await apiFetch("/additional-auto-play/config", { method: "POST", body: JSON.stringify(next) });
    } catch { /* toast already shown */ }
  };

  const openGenerate = () => {
    modal.open({
      title: "Generate virtual viewers",
      size: "sm",
      content: (
        <GenerateViewersDialog
          onDone={() => {
            modal.close();
            void loadViewers();
          }}
        />
      ),
    });
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    try {
      await apiFetch("/additional-auto-play/viewers", {
        method: "DELETE",
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
    } catch { return; }
    void loadViewers();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === viewers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(viewers.map((v) => v.id)));
  };

  const addReaction = async () => {
    const text = newReaction.trim();
    if (!text) return;
    try {
      await apiFetch("/additional-auto-play/reactions", {
        method: "POST",
        body: JSON.stringify({ location: reactionFilter, text }),
      });
    } catch { return; }
    setNewReaction("");
    void loadReactions();
  };

  const deleteReaction = async (id: number) => {
    try {
      await apiFetch("/additional-auto-play/reactions", {
        method: "DELETE",
        body: JSON.stringify({ ids: [id] }),
      });
    } catch { return; }
    void loadReactions();
  };

  const totalPages = Math.max(1, Math.ceil(viewerTotal / PAGE_SIZE));

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Additional Auto Play</h2>
          <p className="text-xs text-text-muted mt-0.5">
            仮想視聴者プールから擬似コメントを生成
          </p>
        </div>
        <ToggleSwitch
          checked={config.enabled}
          onChange={(v) => void saveConfig({ enabled: v })}
          label={config.enabled ? "Active" : "Off"}
        />
      </header>

      {/* Settings */}
      <section className="panel p-4 shrink-0">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
          Settings
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Field label="Mode">
            <Select
              value={config.mode}
              onChange={(v) => void saveConfig({ mode: v })}
              options={[
                { value: "live", label: "Live only" },
                { value: "always", label: "Always" },
              ]}
            />
          </Field>
          <Field label="Channel">
            <Select
              value={config.channel}
              onChange={(v) => void saveConfig({ channel: v })}
              options={[
                { value: "ja", label: "JA" },
                { value: "en", label: "EN" },
              ]}
            />
          </Field>
          <Field label="Active viewers">
            <NumberInput
              value={config.activeViewerCount}
              onChange={(n) => void saveConfig({ activeViewerCount: n })}
              min={1}
              max={200}
            />
          </Field>
          <Field label="Reaction rate">
            <NumberInput
              value={Math.round(config.reactionProbability * 100)}
              onChange={(n) => void saveConfig({ reactionProbability: n / 100 })}
              min={0}
              max={100}
              suffix="%"
            />
          </Field>
          <Field label="Quick share">
            <NumberInput
              value={Math.round(config.quickReactionRatio * 100)}
              onChange={(n) => void saveConfig({ quickReactionRatio: n / 100 })}
              min={0}
              max={100}
              suffix="%"
            />
          </Field>
          <Field label="Delay (sec)">
            <div className="flex items-center gap-1">
              <NumberInput
                value={config.minDelay}
                onChange={(n) => void saveConfig({ minDelay: n })}
                min={0}
              />
              <span className="text-text-faint">–</span>
              <NumberInput
                value={config.maxDelay}
                onChange={(n) => void saveConfig({ maxDelay: n })}
                min={0}
              />
            </div>
          </Field>
        </div>
      </section>

      {/* Body: viewers + reactions side by side */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Viewers */}
        <section className="panel flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Virtual viewers</h3>
              <span className="text-xs text-text-muted">{viewerTotal}</span>
            </div>
            <div className="flex items-center gap-2">
              <SegmentedControl
                value={viewerFilter}
                onChange={(v) => { setViewerFilter(v as "all" | "ja" | "en"); setViewerPage(1); }}
                options={[
                  { value: "all", label: "All" },
                  { value: "ja", label: "JA" },
                  { value: "en", label: "EN" },
                ]}
              />
              <button
                onClick={openGenerate}
                className="px-3 py-1 bg-accent-muted text-accent rounded text-sm font-medium hover:bg-accent/20 transition"
              >
                + Generate
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={deleteSelected}
                  className="px-3 py-1 text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10 rounded transition"
                >
                  Delete ({selectedIds.size})
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel z-10">
                <tr className="text-text-muted text-xs">
                  <th className="w-8 px-4 py-2">
                    <input
                      type="checkbox"
                      onChange={toggleAll}
                      checked={selectedIds.size === viewers.length && viewers.length > 0}
                    />
                  </th>
                  <th className="text-left px-2 py-2 font-medium">Name</th>
                  <th className="text-left px-2 py-2 font-medium">Channel ID</th>
                  <th className="w-12 px-2 py-2 font-medium">Loc</th>
                </tr>
              </thead>
              <tbody>
                {viewers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-text-muted text-sm">
                      No viewers
                    </td>
                  </tr>
                ) : (
                  viewers.map((v) => (
                    <tr
                      key={v.id}
                      className="border-t border-border/50 hover:bg-panel-hover/30 transition"
                    >
                      <td className="py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(v.id)}
                          onChange={() => toggleSelect(v.id)}
                        />
                      </td>
                      <td className="py-1.5 px-2">{v.name}</td>
                      <td className="py-1.5 px-2 text-text-muted font-mono text-xs truncate max-w-[240px]">
                        {v.author_channel_id}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <ChannelBadge channel={v.location} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-border shrink-0">
              <button
                onClick={() => setViewerPage(Math.max(1, viewerPage - 1))}
                disabled={viewerPage <= 1}
                className="text-sm text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed px-2"
              >
                ‹
              </button>
              <span className="text-xs text-text-muted tabular-nums">
                {viewerPage} / {totalPages}
              </span>
              <button
                onClick={() => setViewerPage(Math.min(totalPages, viewerPage + 1))}
                disabled={viewerPage >= totalPages}
                className="text-sm text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed px-2"
              >
                ›
              </button>
            </div>
          )}
        </section>

        {/* Reactions */}
        <section className="panel flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Quick reactions</h3>
              <span className="text-xs text-text-muted">{reactions.length}</span>
            </div>
            <SegmentedControl
              value={reactionFilter}
              onChange={(v) => setReactionFilter(v as "ja" | "en")}
              options={[
                { value: "ja", label: "JA" },
                { value: "en", label: "EN" },
              ]}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {reactions.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-8">No reactions</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {reactions.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-panel-2 rounded-full text-sm border border-border"
                  >
                    {r.text}
                    <button
                      onClick={() => void deleteReaction(r.id)}
                      className="text-text-faint hover:text-[color:var(--color-danger)] text-xs leading-none"
                      aria-label="Delete reaction"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 px-4 py-3 border-t border-border shrink-0">
            <input
              type="text"
              value={newReaction}
              onChange={(e) => setNewReaction(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addReaction(); }}
              placeholder={`Add ${reactionFilter.toUpperCase()} reaction…`}
              className="flex-1 px-3 py-1.5 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
            />
            <button
              onClick={() => void addReaction()}
              className="px-3 py-1.5 bg-accent-muted text-accent rounded-md text-sm font-medium hover:bg-accent/20 transition"
            >
              Add
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Modal content: generate viewers ──

function GenerateViewersDialog({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(100);
  const [location, setLocation] = useState<"ja" | "en">("ja");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      await apiFetch("/additional-auto-play/viewers/generate", {
        method: "POST",
        body: JSON.stringify({ count, location }),
      });
    } catch {
      setBusy(false);
      return;
    }
    setBusy(false);
    onDone();
  };

  return (
    <div className="space-y-4">
      <Field label="Count">
        <NumberInput value={count} onChange={setCount} min={1} max={10000} />
      </Field>
      <Field label="Location">
        <Select
          value={location}
          onChange={(v) => setLocation(v as "ja" | "en")}
          options={[
            { value: "ja", label: "JA" },
            { value: "en", label: "EN" },
          ]}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={() => modal.close()}
          className="px-4 py-2 text-sm text-text-muted hover:text-text transition"
        >
          Cancel
        </button>
        <button
          onClick={generate}
          disabled={busy}
          className="px-4 py-2 bg-accent text-bg rounded-md font-medium text-sm hover:bg-accent-hover transition disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate"}
        </button>
      </div>
    </div>
  );
}

// ── Local bits ──

function ChannelBadge({ channel }: { channel: string }) {
  const upper = channel.toUpperCase();
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
        channel === "ja"
          ? "bg-accent-muted text-accent"
          : "bg-panel-2 text-text-soft"
      }`}
    >
      {upper}
    </span>
  );
}
