import { getHorarioData } from '@/actions';

export const dynamic = 'force-dynamic';

const COLOR_MAP: Record<string, string> = {
  green: '#3FF8C8', blue: '#60A5FA', purple: '#A78BFA',
  amber: '#F59E0B', coral: '#F87171',
};

const TIPO_LABELS: Record<string, string> = {
  personal: 'Personal', grupal: 'Grupal',
  evaluacion: 'Evaluación', bloque: 'Bloque',
};

function fmtFecha(fecha: string) {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default async function HorarioPage() {
  let clases: Awaited<ReturnType<typeof getHorarioData>> = [];

  try {
    clases = await getHorarioData();
  } catch {
    return <div style={{ color: 'var(--fg-muted)', padding: 'var(--space-8)' }}>Error al cargar el horario.</div>;
  }

  const grouped = clases.reduce((acc: Record<string, typeof clases>, clase) => {
    const key = (clase as any).fecha;
    if (!acc[key]) acc[key] = [];
    acc[key].push(clase);
    return acc;
  }, {});

  return (
    <>
      <section className="section-head">
        <span className="eyebrow">Calendario // 02</span>
        <h1>Mi Horario</h1>
      </section>

      {clases.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--fg-muted)' }}>
            No tienes clases próximas programadas.
          </div>
        </div>
      ) : (
        Object.entries(grouped).map(([fecha, clasesDelDia]) => (
          <div key={fecha} style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: 'var(--space-3)' }}>
              {fmtFecha(fecha)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {clasesDelDia.map((clase: any) => {
                const color = COLOR_MAP[clase.color] ?? 'var(--accent)';
                return (
                  <div key={clase.id} className="card" style={{ borderLeft: `3px solid ${color}` }}>
                    <div className="card-body" style={{ padding: 'var(--space-4)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: 'var(--space-1)' }}>{clase.titulo}</div>
                          <div style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>
                            {clase.hora_inicio.slice(0, 5)} – {clase.hora_fin.slice(0, 5)}
                          </div>
                          {clase.notas && (
                            <div style={{ fontSize: '12px', color: 'var(--fg-subtle)', marginTop: 'var(--space-2)' }}>{clase.notas}</div>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px', background: `${color}20`, color, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {TIPO_LABELS[clase.tipo] ?? clase.tipo}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </>
  );
}
