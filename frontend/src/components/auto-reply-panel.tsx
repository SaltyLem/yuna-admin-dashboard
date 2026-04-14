"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "./use-api";

interface VirtualViewer {
  name: string;
  authorChannelId: string;
  location: "ja" | "en";
}

interface Config {
  enabled: boolean;
  intervalSeconds: number;
  viewers: VirtualViewer[];
  channel: "ja" | "en";
}

export function AutoReplyPanel() {
  const [config, setConfig] = useState<Config>({
    enabled: false,
    intervalSeconds: 30,
    viewers: [],
    channel: "ja",
  });
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState<"ja" | "en">("ja");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void apiFetch<Config>("/auto-reply/config").then(setConfig).catch(() => {});
  }, []);

  const save = async (update: Partial<Config>) => {
    const next = { ...config, ...update };
    setConfig(next);
    await apiFetch("/auto-reply/config", { method: "POST", body: JSON.stringify(next) }).catch(() => {});
  };

  const addViewer = () => {
    if (!newName) return;
    const viewer: VirtualViewer = {
      name: newName,
      authorChannelId: "x_" + Math.random().toString(36).slice(2, 10),
      location: newLocation,
    };
    void save({ viewers: [...config.viewers, viewer] });
    setNewName("");
  };

  const removeViewer = (channelId: string) => {
    void save({ viewers: config.viewers.filter((v) => v.authorChannelId !== channelId) });
  };

  return (
    <div className="bg-panel border border-border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-text-soft hover:text-text transition"
      >
        <span>
          Auto Reply
          {config.enabled && (
            <span className="ml-2 text-xs text-green-400">ON ({config.viewers.length} viewers, {config.intervalSeconds}s)</span>
          )}
        </span>
        <span className={"text-text-muted transition-transform " + (open ? "rotate-180" : "")}>&#9662;</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => void save({ enabled: e.target.checked })}
                className="rounded"
              />
              Enabled
            </label>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Channel</label>
              <select
                value={config.channel}
                onChange={(e) => void save({ channel: e.target.value as "ja" | "en" })}
                className="px-2 py-1 bg-panel-2 border border-border-strong rounded text-sm"
              >
                <option value="ja">JA</option>
                <option value="en">EN</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Interval</label>
              <input
                type="number"
                value={config.intervalSeconds}
                onChange={(e) => void save({ intervalSeconds: parseInt(e.target.value) || 30 })}
                className="w-16 px-2 py-1 bg-panel-2 border border-border-strong rounded text-sm"
                min={5}
              />
              <span className="text-xs text-text-muted">sec</span>
            </div>
          </div>

          <div className="text-xs text-text-muted font-medium">Virtual Viewers</div>

          {config.viewers.length > 0 && (
            <div className="space-y-1">
              {config.viewers.map((v) => (
                <div key={v.authorChannelId} className="flex items-center gap-2 text-sm">
                  <span className={"w-6 font-medium " + (v.location === "ja" ? "text-red-400" : "text-blue-400")}>
                    {v.location.toUpperCase()}
                  </span>
                  <span className="text-text flex-1">{v.name}</span>
                  <span className="text-text-faint text-xs font-mono">{v.authorChannelId}</span>
                  <button
                    onClick={() => removeViewer(v.authorChannelId)}
                    className="text-text-muted hover:text-red-400 text-xs"
                  >
                    Del
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addViewer(); }}
              placeholder="Viewer name"
              className="flex-1 px-2 py-1.5 bg-panel-2 border border-border-strong rounded text-sm placeholder:text-text-faint"
            />
            <select
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value as "ja" | "en")}
              className="px-2 py-1.5 bg-panel-2 border border-border-strong rounded text-sm"
            >
              <option value="ja">JA</option>
              <option value="en">EN</option>
            </select>
            <button
              onClick={addViewer}
              className="px-3 py-1.5 bg-panel-2 border border-border-strong rounded text-sm text-text-muted hover:text-text transition"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
