import { getMetricasData } from '@/actions';

export const dynamic = 'force-dynamic';

function fmtFecha(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function MetricasPage() {
  let data: Awaited<ReturnType<typeof getMetricasData>>;

  try {
    data = await getMetricasData();
  } catch {
    return <div style={{ color: 'var(--fg-muted)', padding: 'var(--space-8)' }}>Error al cargar las métricas.</div>;
  }

  const { historialPeso, medidas, bodyMetrics } = data;
  const latestBody = bodyMetrics[0] ?? null;
  const latestPeso = historialPeso[0] ?? null;

  return (
    <>
      <section className="section-head">
        <span className="eyebrow">Progreso // 03</span>
        <h1>Mis Métricas</h1>
      </section>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
        {[
          { label: 'Peso actual', value: latestPeso ? `${latestPeso.peso_kg} kg` : latestBody?.weight_kg ? `${latestBody.weight_kg} kg` : '—' },
          { label: '% Grasa', value: latestBody?.body_fat_pct ? `${latestBody.body_fat_pct}%` : '—' },
          { label: 'Masa muscular', value: latestBody?.muscle_mass_kg ? `${latestBody.muscle_mass_kg} kg` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ flex: 1, minWidth: '140px' }}>
            <div className="card-body" style={{ padding: 'var(--space-4)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)', marginBottom: 'var(--space-2)' }}>{label}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--accent)' }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Historial de peso */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-head">
          <div className="card-title">Historial de peso</div>
        </div>
        {historialPeso.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--fg-muted)' }}>Sin registros de peso.</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Peso</th><th>Variación</th><th>Notas</th></tr></thead>
              <tbody>
                {historialPeso.map((r: any, i: number) => {
                  const prev = historialPeso[i + 1];
                  const delta = prev ? Number(r.peso_kg) - Number(prev.peso_kg) : null;
                  return (
                    <tr key={i}>
                      <td className="text-muted">{fmtFecha(r.fecha)}</td>
                      <td style={{ fontWeight: 700 }}>{r.peso_kg} kg</td>
                      <td>
                        {delta !== null ? (
                          <span style={{ color: delta <= 0 ? 'var(--accent)' : '#f87171', fontWeight: 600, fontSize: '13px' }}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg
                          </span>
                        ) : '—'}
                      </td>
                      <td className="text-muted" style={{ fontSize: '12px' }}>{r.notas ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Medidas corporales */}
      {medidas.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Medidas corporales</div>
            <div className="card-subtitle">En centímetros</div>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Pecho</th><th>Cintura</th><th>Cadera</th><th>Bíceps</th><th>Muslo</th>
                </tr>
              </thead>
              <tbody>
                {medidas.map((m: any, i: number) => (
                  <tr key={i}>
                    <td className="text-muted">{fmtFecha(m.fecha)}</td>
                    {['pecho_cm', 'cintura_cm', 'cadera_cm', 'biceps_cm', 'muslo_cm'].map(col => (
                      <td key={col}>{m[col] ? `${m[col]} cm` : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
