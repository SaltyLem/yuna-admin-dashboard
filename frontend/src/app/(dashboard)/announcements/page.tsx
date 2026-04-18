"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";

type LocaleOpt = "all" | "ja" | "en";

interface Announcement {
  id: number;
  message: string;
  enabled: boolean;
  priority: number;
  locale: "ja" | "en" | null;
  created_at: string;
  updated_at: string;
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState(100);
  const [enabled, setEnabled] = useState(true);
  const [localeSel, setLocaleSel] = useState<LocaleOpt>("all");

  const load = useCallback(async () => {
    const data = await apiFetch<{ announcements: Announcement[] }>("/announcements");
    setItems(data.announcements);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reset = () => { setEditingId(null); setMessage(""); setPriority(100); setEnabled(true); setLocaleSel("all"); };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setMessage(a.message);
    setPriority(a.priority);
    setEnabled(a.enabled);
    setLocaleSel(a.locale ?? "all");
  };

  const save = async () => {
    if (!message.trim()) return;
    const payload = {
      message,
      priority,
      enabled,
      locale: localeSel === "all" ? null : localeSel,
    };
    if (editingId) {
      await apiFetch(`/announcements/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch("/announcements", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    reset();
    await load();
  };

  const toggle = async (a: Announcement) => {
    await apiFetch(`/announcements/${a.id}`, {
      method: "PATCH", body: JSON.stringify({ enabled: !a.enabled }),
    });
    await load();
  };

  const remove = async (id: number) => {
    if (!confirm("delete this announcement?")) return;
    await apiFetch(`/announcements/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold">Overlay Announcements</h2>
        <span className="text-xs text-text-muted">overlay polls every 30s — changes take effect within ~30 sec</span>
      </div>

      {/* Editor */}
      <div className="border-b border-border bg-panel/40 px-4 py-3">
        <div className="text-sm font-semibold mb-2">{editingId ? `Edit #${editingId}` : "New announcement"}</div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message shown to viewers (e.g. 「サーバーメンテナンス中です」)"
          rows={3}
          className="w-full rounded bg-panel border border-border px-3 py-2 text-sm mb-2"
        />
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            locale
            <select
              value={localeSel}
              onChange={(e) => setLocaleSel(e.target.value as LocaleOpt)}
              className="rounded bg-panel border border-border px-2 py-1"
            >
              <option value="all">all (ja + en)</option>
              <option value="ja">ja only</option>
              <option value="en">en only</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            priority
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value, 10) || 100)}
              className="w-20 rounded bg-panel border border-border px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            enabled (visible)
          </label>
          <button
            onClick={save}
            disabled={!message.trim()}
            className={`ml-auto rounded border border-border px-4 py-1 ${
              message.trim() ? "bg-accent-muted text-accent hover:bg-accent-muted/80" : "bg-panel/30 text-text-muted"
            }`}
          >{editingId ? "Save" : "Add"}</button>
          {editingId && (
            <button onClick={reset} className="rounded border border-border bg-panel px-3 py-1 hover:bg-panel/70">Cancel</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg border-b border-border">
            <tr className="text-left text-text-muted">
              <th className="px-2 py-2 w-12">#</th>
              <th className="px-2 py-2 w-16">locale</th>
              <th className="px-2 py-2 w-16">pri</th>
              <th className="px-2 py-2">message</th>
              <th className="px-2 py-2 w-40">updated</th>
              <th className="px-2 py-2 w-16">on</th>
              <th className="px-2 py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b border-border hover:bg-panel/30">
                <td className="px-2 py-1.5 text-text-muted">{a.id}</td>
                <td className="px-2 py-1.5">
                  <span className="rounded bg-panel px-1.5 py-0.5 text-xs text-text-muted">
                    {a.locale ?? "all"}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-text-muted">{a.priority}</td>
                <td className="px-2 py-1.5 whitespace-pre-wrap break-words">{a.message}</td>
                <td className="px-2 py-1.5 text-text-muted text-xs">{new Date(a.updated_at).toLocaleString()}</td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => toggle(a)}
                    className={`rounded border border-border px-1.5 py-0.5 text-xs ${a.enabled ? "bg-green-600/30 text-green-300" : "bg-panel text-text-muted"}`}
                  >{a.enabled ? "on" : "off"}</button>
                </td>
                <td className="px-2 py-1.5 flex gap-1">
                  <button onClick={() => openEdit(a)} className="rounded border border-border bg-panel px-2 py-0.5 text-xs hover:bg-panel/70">edit</button>
                  <button onClick={() => remove(a.id)} className="rounded border border-border bg-red-600/20 px-2 py-0.5 text-xs hover:bg-red-600/40">del</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="text-center text-text-muted py-6">no announcements</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
