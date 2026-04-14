export default function OverviewPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-panel border border-border rounded-lg p-5">
          <p className="text-sm text-text-muted mb-1">Stream Status</p>
          <p className="text-lg font-medium">Offline</p>
        </div>
        <div className="bg-panel border border-border rounded-lg p-5">
          <p className="text-sm text-text-muted mb-1">YUNA Status</p>
          <p className="text-lg font-medium">--</p>
        </div>
        <div className="bg-panel border border-border rounded-lg p-5">
          <p className="text-sm text-text-muted mb-1">Trade Bot</p>
          <p className="text-lg font-medium">Inactive</p>
        </div>
      </div>
    </div>
  );
}
