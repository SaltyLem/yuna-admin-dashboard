"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import LogPanel from "./log-panel";

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
}

type LayoutMode = "auto" | "rows" | "cols";

const PANELS_KEY = "log_panels";
const LAYOUT_KEY = "log_layout";

export default function LogPage() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [panels, setPanels] = useState<string[]>([]);
  const [layout, setLayout] = useState<LayoutMode>("auto");
  const [loaded, setLoaded] = useState(false);

  // Restore selection
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PANELS_KEY);
      if (saved) setPanels(JSON.parse(saved) as string[]);
      const lay = localStorage.getItem(LAYOUT_KEY) as LayoutMode | null;
      if (lay === "auto" || lay === "rows" || lay === "cols") setLayout(lay);
    } catch {/* ignore */}
    setLoaded(true);
  }, []);

  // Persist selection
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(PANELS_KEY, JSON.stringify(panels));
  }, [panels, loaded]);
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout, loaded]);

  const loadContainers = useCallback(async () => {
    try {
      const data = await apiFetch<{ containers: ContainerInfo[] }>("/docker/containers");
      setContainers(data.containers);
    } catch {/* toast handled */}
  }, []);

  useEffect(() => { void loadContainers(); }, [loadContainers]);

  // First-time default: prism-yuna-1 if present, else first container.
  useEffect(() => {
    if (!loaded) return;
    if (panels.length === 0 && containers.length > 0) {
      const yuna = containers.find((c) => c.name === "prism-yuna-1");
      setPanels([yuna?.name ?? containers[0]!.name]);
    }
  }, [loaded, containers, panels.length]);

  const togglePanel = (name: string) => {
    setPanels((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]);
  };
  const removePanel = (name: string) => setPanels((prev) => prev.filter((p) => p !== name));

  // Grid template: auto = squareish; rows = N×1 (one column, stacked); cols = 1×N (one row).
  const gridStyle = (() => {
    const n = Math.max(1, panels.length);
    if (layout === "rows") return { gridTemplateColumns: "1fr", gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` };
    if (layout === "cols") return { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: "1fr" };
    // auto: 1=>1×1, 2=>2×1, 3-4=>2×2, 5-6=>3×2, 7-9=>3×3
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    return {
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    };
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="text-sm font-semibold">Containers:</span>
        <div className="flex flex-wrap gap-1">
          {containers.length === 0 && (
            <span className="text-xs text-text-muted">(none)</span>
          )}
          {containers.map((c) => {
            const active = panels.includes(c.name);
            return (
              <button
                key={c.id}
                onClick={() => togglePanel(c.name)}
                className={`rounded-md border border-border px-2 py-1 text-xs ${
                  active ? "bg-accent-muted text-accent" : "bg-panel hover:bg-panel/70"
                }`}
                title={`${c.image} — ${c.status}`}
              >
                {c.name}
                {c.state !== "running" && <span className="ml-1 text-text-muted">({c.state})</span>}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => void loadContainers()}
          className="rounded-md bg-panel border border-border px-2 py-1 text-xs hover:bg-panel/70"
          title="reload list"
        >↻</button>

        <div className="ml-auto flex items-center gap-1 text-xs">
          <span className="text-text-muted">layout</span>
          {(["auto", "rows", "cols"] as LayoutMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setLayout(m)}
              className={`rounded border border-border px-2 py-0.5 ${
                layout === m ? "bg-accent-muted text-accent" : "bg-panel hover:bg-panel/70"
              }`}
            >{m}</button>
          ))}
        </div>
      </div>

      {/* Panels grid */}
      {panels.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
          コンテナを選択してログを開く
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid gap-2 p-2" style={gridStyle}>
          {panels.map((name) => (
            <LogPanel key={name} container={name} onClose={() => removePanel(name)} />
          ))}
        </div>
      )}
    </div>
  );
}
