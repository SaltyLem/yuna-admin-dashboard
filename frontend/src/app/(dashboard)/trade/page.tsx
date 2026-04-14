export default function TradePage() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Trade</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-panel border border-border rounded-lg p-5">
          <p className="text-sm text-text-muted mb-1">Bot Status</p>
          <p className="text-lg font-medium">Inactive</p>
        </div>
        <div className="bg-panel border border-border rounded-lg p-5">
          <p className="text-sm text-text-muted mb-1">Active Rules</p>
          <p className="text-lg font-medium">0</p>
        </div>
        <div className="bg-panel border border-border rounded-lg p-5">
          <p className="text-sm text-text-muted mb-1">Open Positions</p>
          <p className="text-lg font-medium">0</p>
        </div>
      </div>
    </div>
  );
}
