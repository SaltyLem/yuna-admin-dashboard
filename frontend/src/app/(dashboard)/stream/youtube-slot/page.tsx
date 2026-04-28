"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";

type Channel = "ja" | "en";
const CHANNELS: Channel[] = ["ja", "en"];
const CHANNEL_LABEL: Record<Channel, string> = { ja: "JA", en: "EN" };
const CHANNEL_COLOR: Record<Channel, string> = { ja: "#22d3ee", en: "#e879f9" };

interface Status {
  channel: Channel;
  linked: boolean;
  channel_id: string | null;
  channel_title: string | null;
  linked_at: string | null;
  reusable_stream_key: string | null;
  reusable_rtmp_url: string | null;
  current_broadcast: string | null;
  current_rtmp: string | null;
  last_switch_at: string | null;
}

interface Template {
  channel: Channel;
  title_template: string;
  description_template: string;
  updated_at: string | null;
}

interface SwitchResult {
  ok?: boolean;
  broadcast_id?: string;
  watch_url?: string;
  rtmp_url?: string;
  title?: string;
  error?: string;
  detail?: string;
}

export default function YouTubeSlotPage(): React.JSX.Element {
  const [statuses, setStatuses] = useState<Record<Channel, Status | null>>({ ja: null, en: null });
  const [templates, setTemplates] = useState<Record<Channel, Template | null>>({ ja: null, en: null });
  const [busy, setBusy] = useState<Record<Channel, boolean>>({ ja: false, en: false });
  const [savingTpl, setSavingTpl] = useState<Record<Channel, boolean>>({ ja: false, en: false });
  const [log, setLog] = useState<string[]>([]);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 50));
  }, []);

  const loadStatus = useCallback(async (channel: Channel) => {
    try {
      const data = await apiFetch<Status>(`/stream/youtube/status?channel=${channel}`, { silent: true });
      setStatuses((prev) => ({ ...prev, [channel]: data }));
    } catch (err) {
      appendLog(`[${channel}] status error: ${String(err)}`);
    }
  }, [appendLog]);

  const loadTemplate = useCallback(async (channel: Channel) => {
    try {
      const data = await apiFetch<Template>(`/stream/youtube/template/${channel}`, { silent: true });
      setTemplates((prev) => ({ ...prev, [channel]: data }));
    } catch (err) {
      appendLog(`[${channel}] template load error: ${String(err)}`);
    }
  }, [appendLog]);

  useEffect(() => {
    void loadStatus("ja");
    void loadStatus("en");
    void loadTemplate("ja");
    void loadTemplate("en");
    const t = setInterval(() => {
      void loadStatus("ja");
      void loadStatus("en");
    }, 30_000);
    return () => clearInterval(t);
  }, [loadStatus, loadTemplate]);

  const startOAuth = useCallback(async (channel: Channel) => {
    setBusy((prev) => ({ ...prev, [channel]: true }));
    try {
      const data = await apiFetch<{ url?: string; error?: string }>(
        `/stream/youtube/oauth/start`,
        { method: "POST", body: JSON.stringify({ channel }) },
      );
      if (data.url) {
        appendLog(`[${channel}] OAuth URL opened`);
        window.open(data.url, "_blank");
      } else {
        appendLog(`[${channel}] OAuth start failed: ${data.error}`);
      }
    } catch (err) {
      appendLog(`[${channel}] error: ${String(err)}`);
    } finally {
      setBusy((prev) => ({ ...prev, [channel]: false }));
    }
  }, [appendLog]);

  const switchSlot = useCallback(async (channel: Channel) => {
    setBusy((prev) => ({ ...prev, [channel]: true }));
    try {
      const data = await apiFetch<SwitchResult>(
        `/stream/youtube/switch`,
        { method: "POST", body: JSON.stringify({ channel }) },
      );
      if (data.ok) {
        appendLog(`[${channel}] ✓ Switched to ${data.broadcast_id} (${data.watch_url})`);
        await loadStatus(channel);
      } else {
        appendLog(`[${channel}] ✗ Switch failed: ${data.error} ${data.detail ?? ""}`);
      }
    } catch (err) {
      appendLog(`[${channel}] switch error: ${String(err)}`);
    } finally {
      setBusy((prev) => ({ ...prev, [channel]: false }));
    }
  }, [appendLog, loadStatus]);

  const saveTemplate = useCallback(async (channel: Channel) => {
    const tpl = templates[channel];
    if (!tpl) return;
    setSavingTpl((prev) => ({ ...prev, [channel]: true }));
    try {
      await apiFetch(`/stream/youtube/template/${channel}`, {
        method: "PUT",
        body: JSON.stringify({
          title_template: tpl.title_template,
          description_template: tpl.description_template,
        }),
      });
      appendLog(`[${channel}] ✓ Template saved`);
    } catch (err) {
      appendLog(`[${channel}] template save error: ${String(err)}`);
    } finally {
      setSavingTpl((prev) => ({ ...prev, [channel]: false }));
    }
  }, [appendLog, templates]);

  const updateTpl = useCallback((channel: Channel, field: "title_template" | "description_template", value: string) => {
    setTemplates((prev) => {
      const cur = prev[channel] ?? { channel, title_template: "", description_template: "", updated_at: null };
      return { ...prev, [channel]: { ...cur, [field]: value } };
    });
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto text-zinc-100">
      <h1 className="text-2xl font-bold mb-2">YouTube Slot Manager</h1>
      <p className="text-sm text-zinc-400 mb-2">
        Each switch creates a new broadcast (titles/description from template) bound to the
        same reusable stream — broadcaster keeps pushing the same RTMP key forever.
      </p>
      <p className="text-sm mb-6 flex gap-4">
        <a href="/stream/youtube-slot/thumbnail" className="text-cyan-400 underline">→ Thumbnail Lab</a>
        <a href="/stream/youtube-slot/calendar" className="text-cyan-400 underline">→ Thumbnail Calendar</a>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {CHANNELS.map((channel) => {
          const s = statuses[channel];
          const isBusy = busy[channel];
          return (
            <div key={channel} className="border border-zinc-700 rounded-lg p-5 bg-zinc-900">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold" style={{ color: CHANNEL_COLOR[channel] }}>
                  {CHANNEL_LABEL[channel]} Channel
                </h2>
                {s?.linked ? (
                  <span className="text-xs px-2 py-1 rounded bg-emerald-900 text-emerald-300">Linked</span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400">Not linked</span>
                )}
              </div>

              {s?.linked ? (
                <div className="text-sm text-zinc-300 space-y-1 mb-4">
                  <div>
                    <span className="text-zinc-500">Channel:</span> {s.channel_title}
                  </div>
                  {s.reusable_stream_key && (
                    <div>
                      <span className="text-zinc-500">Stream key:</span>{" "}
                      <code className="text-xs">{s.reusable_stream_key}</code>
                    </div>
                  )}
                  {s.current_broadcast && (
                    <div>
                      <span className="text-zinc-500">Current:</span>{" "}
                      <a
                        href={`https://www.youtube.com/watch?v=${s.current_broadcast}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 underline text-xs"
                      >
                        {s.current_broadcast}
                      </a>
                    </div>
                  )}
                  {s.last_switch_at && (
                    <div className="text-xs text-zinc-500">
                      Last switch: {new Date(s.last_switch_at).toLocaleString()}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 mb-4">YouTube account not linked.</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => startOAuth(channel)}
                  disabled={isBusy}
                  className="flex-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm disabled:opacity-50"
                >
                  {s?.linked ? "Re-link" : "Link YouTube"}
                </button>
                <button
                  onClick={() => switchSlot(channel)}
                  disabled={isBusy || !s?.linked}
                  className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm disabled:opacity-50"
                >
                  {isBusy ? "..." : "Switch slot"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Templates */}
      {CHANNELS.map((channel) => {
        const tpl = templates[channel];
        if (!tpl) return null;
        const isSaving = savingTpl[channel];
        return (
          <div key={`tpl-${channel}`} className="border border-zinc-700 rounded-lg p-5 bg-zinc-900 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold" style={{ color: CHANNEL_COLOR[channel] }}>
                {CHANNEL_LABEL[channel]} Template
              </h3>
              <button
                onClick={() => saveTemplate(channel)}
                disabled={isSaving}
                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
            <p className="text-xs text-zinc-500 mb-2">
              Placeholders: <code>{`{date}`}</code> <code>{`{time}`}</code>{" "}
              <code>{`{weekday}`}</code> <code>{`{datetime}`}</code>
            </p>
            <label className="text-xs text-zinc-400 block mb-1">Title</label>
            <input
              type="text"
              value={tpl.title_template}
              onChange={(e) => updateTpl(channel, "title_template", e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded text-sm mb-3"
              maxLength={100}
            />
            <label className="text-xs text-zinc-400 block mb-1">Description</label>
            <textarea
              value={tpl.description_template}
              onChange={(e) => updateTpl(channel, "description_template", e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded text-xs font-mono"
              rows={14}
            />
          </div>
        );
      })}

      <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
        <h3 className="text-sm font-bold mb-2 text-zinc-400">Activity log</h3>
        <pre className="text-xs text-zinc-300 max-h-64 overflow-auto whitespace-pre-wrap">
          {log.length === 0 ? "(no activity)" : log.join("\n")}
        </pre>
      </div>
    </div>
  );
}
