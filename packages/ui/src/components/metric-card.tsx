interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  negative?: boolean;
  progress?: number;
}

export function MetricCard({ label, value, delta, negative, progress }: MetricCardProps) {
  return (
    <div className="metric">
      <div className="label-caps">{label}</div>
      <div className="metric-row">
        <span className="metric-value">{value}</span>
        {delta && <span className={`metric-delta${negative ? ' neg' : ''}`}>{delta}</span>}
      </div>
      {progress !== undefined && (
        <div className="metric-bar">
          <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
    </div>
  );
}
