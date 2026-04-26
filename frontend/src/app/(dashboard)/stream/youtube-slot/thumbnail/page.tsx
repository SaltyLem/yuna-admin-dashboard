"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/components/use-api";

type Channel = "ja" | "en";
const CHANNELS: Channel[] = ["ja", "en"];
const POSES = ["1", "2", "3", "4", "5"];
const EXPRESSIONS = [
  "neutral", "happy", "sad", "surprised", "thinking",
  "excited", "shy", "angry", "confused", "smug",
];
const LAYOUTS = ["A", "B"];

interface BgResult {
  url: string;
  seed?: number;
  prompt: string;
}

interface RenderResult {
  data_url: string;
  url: string;
}

function todayJst(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60_000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

const PROMPT_PRESETS_JA: Array<{ label: string; prompt: string }> = [
  { label: "夜景・ネオン", prompt: "futuristic city night skyline, neon lights, purple and cyan, anime aesthetic" },
  { label: "朝焼け", prompt: "soft sunrise sky, pastel pink and orange clouds, peaceful morning" },
  { label: "桜", prompt: "japanese cherry blossom petals floating, soft pink, dreamy bokeh" },
  { label: "宇宙", prompt: "cosmic galaxy nebula, deep space, stars and purple gas clouds" },
  { label: "海辺", prompt: "tropical beach at sunset, ocean waves, golden hour" },
  { label: "abstract", prompt: "abstract liquid gradient, holographic, iridescent purple cyan" },
];

export default function ThumbnailLabPage(): React.JSX.Element {
  const [channel, setChannel] = useState<Channel>("ja");
  const [date, setDate] = useState<string>(todayJst());
  const [weekday, setWeekday] = useState<string>("");
  const [catchCopy, setCatchCopy] = useState<string>("");
  const [subCopy, setSubCopy] = useState<string>("");
  const [pose, setPose] = useState<string>("1");
  const [expr, setExpr] = useState<string>("happy");
  const [layout, setLayout] = useState<string>("A");
  const [bgUrl, setBgUrl] = useState<string>("");
  const [bgColor, setBgColor] = useState<string>("#1a1a2e");

  const [prompt, setPrompt] = useState<string>("");
  const [seed, setSeed] = useState<string>("");

  const [bgBusy, setBgBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  const [bgInfo, setBgInfo] = useState<BgResult | null>(null);
  const [render, setRender] = useState<RenderResult | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 50));
  }, []);

  const params = useMemo(() => {
    const p: Record<string, string> = { channel };
    if (date) p["date"] = date;
    if (weekday) p["weekday"] = weekday;
    if (catchCopy) p["catch"] = catchCopy;
    if (subCopy) p["sub"] = subCopy;
    if (pose) p["pose"] = pose;
    if (expr) p["expr"] = expr;
    if (layout) p["layout"] = layout;
    if (bgUrl) p["bg"] = bgUrl;
    if (bgColor) p["bgColor"] = bgColor;
    return p;
  }, [channel, date, weekday, catchCopy, subCopy, pose, expr, layout, bgUrl, bgColor]);

  // Refresh preview iframe URL whenever params change (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      const search = new URLSearchParams(params).toString();
      apiFetch<{ url: string }>(`/stream/youtube/thumbnail/preview-url?${search}`, { silent: true })
        .then((r) => setPreviewUrl(r.url))
        .catch((err) => appendLog(`preview-url error: ${String(err)}`));
    }, 300);
    return () => clearTimeout(t);
  }, [params, appendLog]);

  const generateBackground = useCallback(async () => {
    setBgBusy(true);
    try {
      const seedNum = seed.trim() ? Number(seed.trim()) : undefined;
      const data = await apiFetch<BgResult>(`/stream/youtube/thumbnail/background`, {
        method: "POST",
        body: JSON.stringify({
          channel,
          prompt: prompt.trim() || undefined,
          ...(seedNum != null && Number.isFinite(seedNum) ? { seed: seedNum } : {}),
        }),
      });
      setBgInfo(data);
      setBgUrl(data.url);
      appendLog(`✓ bg generated (seed=${data.seed ?? "?"})`);
    } catch (err) {
      appendLog(`bg error: ${String(err)}`);
    } finally {
      setBgBusy(false);
    }
  }, [appendLog, channel, prompt, seed]);

  const renderThumbnail = useCallback(async () => {
    setRenderBusy(true);
    try {
      const data = await apiFetch<RenderResult>(`/stream/youtube/thumbnail/render`, {
        method: "POST",
        body: JSON.stringify(params),
      });
      setRender(data);
      appendLog(`✓ rendered`);
    } catch (err) {
      appendLog(`render error: ${String(err)}`);
    } finally {
      setRenderBusy(false);
    }
  }, [appendLog, params]);

  const downloadPng = useCallback(() => {
    if (!render?.data_url) return;
    const a = document.createElement("a");
    a.href = render.data_url;
    a.download = `thumbnail-${channel}-${date.replace(/\//g, "-")}-pose${pose}-${expr}.png`;
    a.click();
  }, [render, channel, date, pose, expr]);

  return (
    <div className="p-6 max-w-7xl mx-auto text-zinc-100">
      <h1 className="text-2xl font-bold mb-1">Thumbnail Lab</h1>
      <p className="text-sm text-zinc-400 mb-6">
        パターン作りページ。背景は fal で生成 → overlay/thumbnail で合成 → puppeteer で PNG 化。
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Controls */}
        <div className="lg:col-span-1 space-y-4">
          <Section title="Channel">
            <div className="flex gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`flex-1 px-3 py-2 rounded text-sm font-bold ${
                    channel === c ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {c.toUpperCase()}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Text">
            <Field label="Date">
              <input value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} placeholder={todayJst()} />
            </Field>
            <Field label="Weekday (空で自動)">
              <input value={weekday} onChange={(e) => setWeekday(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Catch copy (空でデフォ)">
              <input value={catchCopy} onChange={(e) => setCatchCopy(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Sub copy">
              <input value={subCopy} onChange={(e) => setSubCopy(e.target.value)} className={inputCls} />
            </Field>
          </Section>

          <Section title="Live2D">
            <Field label="Pose">
              <select value={pose} onChange={(e) => setPose(e.target.value)} className={inputCls}>
                {POSES.map((p) => <option key={p} value={p}>Pose {p}</option>)}
              </select>
            </Field>
            <Field label="Expression">
              <select value={expr} onChange={(e) => setExpr(e.target.value)} className={inputCls}>
                {EXPRESSIONS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Layout">
              <div className="flex gap-2">
                {LAYOUTS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLayout(l)}
                    className={`flex-1 px-3 py-2 rounded text-sm ${
                      layout === l ? "bg-cyan-600 text-white" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    Layout {l}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          <Section title="Background (fal)">
            <Field label="Prompt">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className={`${inputCls} font-mono`}
                rows={3}
                placeholder="(空でデフォルトプロンプト)"
              />
            </Field>
            <div className="flex flex-wrap gap-1 mb-2">
              {PROMPT_PRESETS_JA.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setPrompt(p.prompt)}
                  className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Field label="Seed (空でランダム)">
              <input value={seed} onChange={(e) => setSeed(e.target.value)} className={inputCls} placeholder="例: 42" />
            </Field>
            <Field label="Fallback bg color">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-full h-10 bg-zinc-800 border border-zinc-700 rounded"
              />
            </Field>
            <button
              onClick={generateBackground}
              disabled={bgBusy}
              className="w-full px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-sm disabled:opacity-50 mt-2"
            >
              {bgBusy ? "Generating..." : "Generate background"}
            </button>
            {bgInfo && (
              <div className="text-xs text-zinc-500 mt-2 break-all">
                seed: {bgInfo.seed ?? "?"} <br />
                <a href={bgInfo.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">bg url</a>
              </div>
            )}
            <Field label="Or paste bg URL directly">
              <input value={bgUrl} onChange={(e) => setBgUrl(e.target.value)} className={inputCls} placeholder="https://..." />
            </Field>
          </Section>

          <Section title="Render">
            <button
              onClick={renderThumbnail}
              disabled={renderBusy}
              className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm disabled:opacity-50"
            >
              {renderBusy ? "Rendering..." : "Render PNG (puppeteer)"}
            </button>
            {render && (
              <button
                onClick={downloadPng}
                className="w-full px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm mt-2"
              >
                Download PNG
              </button>
            )}
          </Section>
        </div>

        {/* Preview area */}
        <div className="lg:col-span-2 space-y-4">
          <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-900">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-zinc-400">Live preview (overlay iframe, 1280×720)</h3>
              <button
                onClick={() => iframeRef.current?.contentWindow?.location.reload()}
                className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
              >
                Reload
              </button>
            </div>
            {previewUrl ? (
              <iframe
                ref={iframeRef}
                src={previewUrl}
                className="border border-zinc-800 bg-black"
                style={{ width: 1280, height: 720, transformOrigin: "top left", transform: "scale(0.55)" }}
              />
            ) : (
              <div className="h-[400px] flex items-center justify-center text-zinc-600">loading preview URL...</div>
            )}
            <div className="text-xs text-zinc-600 mt-2 break-all">
              {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="underline">{previewUrl}</a>}
            </div>
          </div>

          {render && (
            <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-900">
              <h3 className="text-sm font-bold text-zinc-400 mb-2">Rendered PNG (puppeteer screenshot)</h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={render.data_url} alt="thumbnail" className="w-full border border-zinc-800" />
            </div>
          )}

          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
            <h3 className="text-sm font-bold mb-2 text-zinc-400">Activity log</h3>
            <pre className="text-xs text-zinc-300 max-h-48 overflow-auto whitespace-pre-wrap">
              {log.length === 0 ? "(no activity)" : log.join("\n")}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded text-sm";

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900">
      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mb-2">
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
