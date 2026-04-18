export default function TradeRulesPage() {
  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Trade rules</h2>
        <p className="text-xs text-text-muted mt-0.5">自動取引のルール定義 — 未実装</p>
      </header>

      <section className="rounded-xl border border-dashed border-white/15 bg-panel/40 p-6 flex-1 flex flex-col items-center justify-center text-center gap-2">
        <div className="text-[11px] uppercase tracking-[0.2em] text-text-faint">planned</div>
        <div className="text-base text-text-muted max-w-md">
          トレードルール (ストップ / テイクプロフィット / DCA ルール等) を管理する UI。
          yuna-api 側に<code className="text-text mx-1">trade_rules</code>テーブルが無いため現状は非表示。
          実装時はここを埋める。
        </div>
      </section>
    </div>
  );
}
