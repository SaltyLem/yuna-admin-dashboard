"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";

interface Rule {
  id: number;
  language: string;
  scope: "pre" | "post";
  pattern: string;
  replacement: string;
  flags: string;
  priority: number;
  enabled: boolean;
  note: string;
  updated_at: string;
}

interface FormState {
  language: string;
  scope: "pre" | "post";
  pattern: string;
  replacement: string;
  flags: string;
  priority: number;
  enabled: boolean;
  note: string;
}

const EMPTY_FORM: FormState = {
  language: "ja",
  scope: "post",
  pattern: "",
  replacement: "",
  flags: "",
  priority: 100,
  enabled: true,
  note: "",
};

export default function ReadingRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [scopeFilter, setScopeFilter] = useState<"all" | "pre" | "post">("all");

  const load = useCallback(async () => {
    const data = await apiFetch<{ rules: Rule[] }>("/tts/reading-rules?language=ja&all=1");
    setRules(data.rules);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setEditingId(null); setForm(EMPTY_FORM); };
  const openEdit = (r: Rule) => {
    setEditingId(r.id);
    setForm({
      language: r.language, scope: r.scope, pattern: r.pattern, replacement: r.replacement,
      flags: r.flags, priority: r.priority, enabled: r.enabled, note: r.note,
    });
  };

  const save = async () => {
    if (!form.pattern || form.replacement === undefined) return;
    if (editingId) {
      await apiFetch(`/tts/reading-rules/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
    } else {
      await apiFetch("/tts/reading-rules", { method: "POST", body: JSON.stringify(form) });
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
    await load();
  };

  const toggleEnabled = async (r: Rule) => {
    await apiFetch(`/tts/reading-rules/${r.id}`, {
      method: "PATCH", body: JSON.stringify({ enabled: !r.enabled }),
    });
    await load();
  };

  const remove = async (id: number) => {
    if (!confirm("delete this rule?")) return;
    await apiFetch(`/tts/reading-rules/${id}`, { method: "DELETE" });
    await load();
  };

  const filtered = scopeFilter === "all" ? rules : rules.filter((r) => r.scope === scopeFilter);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold">TTS Reading Rules</h2>
        <span className="text-xs text-text-muted">
          wrapper polls every 60s — changes take effect within ~1 min
        </span>
        <div className="ml-auto flex items-center gap-1 text-xs">
          <span className="text-text-muted">scope</span>
          {(["all", "pre", "post"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScopeFilter(s)}
              className={`rounded border border-border px-2 py-0.5 ${
                scopeFilter === s ? "bg-accent-muted text-accent" : "bg-panel hover:bg-panel/70"
              }`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="border-b border-border bg-panel/40 px-4 py-3">
        <div className="text-sm font-semibold mb-2">{editingId ? `Edit #${editingId}` : "New rule"}</div>
        <div className="grid grid-cols-12 gap-2 text-sm">
          <select
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value as "pre" | "post" })}
            className="col-span-1 rounded bg-panel border border-border px-2 py-1"
          >
            <option value="pre">pre</option>
            <option value="post">post</option>
          </select>
          <input
            value={form.pattern}
            onChange={(e) => setForm({ ...form, pattern: e.target.value })}
            placeholder="regex pattern"
            className="col-span-4 rounded bg-panel border border-border px-2 py-1 font-mono text-xs"
          />
          <input
            value={form.replacement}
            onChange={(e) => setForm({ ...form, replacement: e.target.value })}
            placeholder="replacement"
            className="col-span-3 rounded bg-panel border border-border px-2 py-1"
          />
          <input
            value={form.flags}
            onChange={(e) => setForm({ ...form, flags: e.target.value })}
            placeholder="flags (i)"
            className="col-span-1 rounded bg-panel border border-border px-2 py-1"
          />
          <input
            type="number"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value, 10) || 100 })}
            placeholder="priority"
            className="col-span-1 rounded bg-panel border border-border px-2 py-1"
          />
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="note"
            className="col-span-2 rounded bg-panel border border-border px-2 py-1"
          />
          <div className="col-span-12 flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              enabled
            </label>
            <button
              onClick={save}
              disabled={!form.pattern}
              className={`ml-auto rounded border border-border px-3 py-1 ${
                form.pattern ? "bg-accent-muted text-accent hover:bg-accent-muted/80" : "bg-panel/30 text-text-muted"
              }`}
            >{editingId ? "Save" : "Add"}</button>
            {editingId && (
              <button onClick={openNew} className="rounded border border-border bg-panel px-3 py-1 hover:bg-panel/70">Cancel</button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg border-b border-border">
            <tr className="text-left text-text-muted">
              <th className="px-2 py-2 w-12">#</th>
              <th className="px-2 py-2 w-16">scope</th>
              <th className="px-2 py-2 w-16">pri</th>
              <th className="px-2 py-2">pattern</th>
              <th className="px-2 py-2">replacement</th>
              <th className="px-2 py-2 w-12">flags</th>
              <th className="px-2 py-2">note</th>
              <th className="px-2 py-2 w-16">on</th>
              <th className="px-2 py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-border hover:bg-panel/30">
                <td className="px-2 py-1.5 text-text-muted">{r.id}</td>
                <td className="px-2 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${r.scope === "pre" ? "bg-blue-600/30" : "bg-purple-600/30"}`}>
                    {r.scope}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-text-muted">{r.priority}</td>
                <td className="px-2 py-1.5 font-mono text-xs">{r.pattern}</td>
                <td className="px-2 py-1.5 font-mono text-xs">{r.replacement}</td>
                <td className="px-2 py-1.5 text-text-muted">{r.flags || "—"}</td>
                <td className="px-2 py-1.5 text-text-muted">{r.note || ""}</td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => toggleEnabled(r)}
                    className={`rounded border border-border px-1.5 py-0.5 text-xs ${r.enabled ? "bg-green-600/30 text-green-300" : "bg-panel text-text-muted"}`}
                  >{r.enabled ? "on" : "off"}</button>
                </td>
                <td className="px-2 py-1.5 flex gap-1">
                  <button
                    onClick={() => openEdit(r)}
                    className="rounded border border-border bg-panel px-2 py-0.5 text-xs hover:bg-panel/70"
                  >edit</button>
                  <button
                    onClick={() => remove(r.id)}
                    className="rounded border border-border bg-red-600/20 px-2 py-0.5 text-xs hover:bg-red-600/40"
                  >del</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center text-text-muted py-6">no rules</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
