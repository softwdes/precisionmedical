import { getDashboardData } from '@/actions';

export const dynamic = 'force-dynamic';

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: 'Hipertrofia', fat_loss: 'Pérdida de grasa', strength: 'Fuerza',
  endurance: 'Resistencia', flexibility: 'Flexibilidad', general_fitness: 'Fitness general',
};

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: '160px' }}>
      <div className="card-body" style={{ padding: 'var(--space-4)' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)', marginBottom: 'var(--space-2)' }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--fg-base)', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: 'var(--space-1)' }}>{sub}</div>}
      </div>
    </div>
  );
}

export default async function InicioPage() {
  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;

  try {
    data = await getDashboardData();
  } catch {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--fg-muted)' }}>
        No se pudo cargar tu perfil. Contacta a tu entrenador.
      </div>
    );
  }

  const { student, peso, rutina, proximaClase, nutricion } = data;
  const firstName = student.full_name.split(' ')[0] ?? student.full_name;

  return (
    <>
      <section className="section-head">
        <span className="eyebrow">Bienvenido // {firstName}</span>
        <h1>Mi Entrenamiento</h1>
      </section>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
        <StatCard
          label="Último peso"
          value={peso ? `${peso.peso_kg} kg` : '—'}
          sub={peso ? new Date(peso.fecha).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : 'Sin registro'}
        />
        <StatCard
          label="Meta calórica"
          value={nutricion?.calorias_meta ? `${Math.round(Number(nutricion.calorias_meta))} kcal` : '—'}
          sub={nutricion ? `P ${Math.round(Number(nutricion.proteinas_g))}g · C ${Math.round(Number(nutricion.carbos_g))}g · G ${Math.round(Number(nutricion.grasas_g))}g` : 'Sin plan activo'}
          accent={!!nutricion}
        />
        <StatCard
          label="Próxima clase"
          value={proximaClase ? new Date(`${proximaClase.fecha}T${proximaClase.hora_inicio}`).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
          sub={proximaClase ? `${proximaClase.hora_inicio.slice(0, 5)} · ${proximaClase.titulo}` : 'Sin clases próximas'}
        />
        <StatCard
          label="Rutina activa"
          value={rutina ? '✓' : '—'}
          sub={rutina?.nombre ?? 'Sin rutina asignada'}
          accent={!!rutina}
        />
      </div>

      {/* Rutina activa */}
      {rutina && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Rutina activa</div>
              <div className="card-subtitle">{rutina.nombre}</div>
            </div>
          </div>
        </div>
      )}

      {/* Objetivos */}
      {student.goals && student.goals.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Mis objetivos</div>
          </div>
          <div className="card-body" style={{ padding: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {student.goals.map((g: string) => (
              <span key={g} className="badge badge-mint-soft">
                {GOAL_LABELS[g] ?? g}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
