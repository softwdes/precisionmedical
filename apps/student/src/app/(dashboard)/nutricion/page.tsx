import { getNutricionData } from '@/actions';

export const dynamic = 'force-dynamic';

const OBJETIVO_LABELS: Record<string, string> = {
  perdida_peso: 'Pérdida de peso',
  ganancia_muscular: 'Ganancia muscular',
  mantenimiento: 'Mantenimiento',
  rendimiento: 'Rendimiento deportivo',
  salud_general: 'Salud general',
};

export default async function NutricionPage() {
  let plan: Awaited<ReturnType<typeof getNutricionData>> = null;

  try {
    plan = await getNutricionData();
  } catch {
    return <div style={{ color: 'var(--fg-muted)', padding: 'var(--space-8)' }}>Error al cargar el plan nutricional.</div>;
  }

  return (
    <>
      <section className="section-head">
        <span className="eyebrow">Nutrición // 04</span>
        <h1>Mi Nutrición</h1>
      </section>

      {!plan ? (
        <div className="card">
          <div className="card-body" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--fg-muted)' }}>
            Tu entrenador aún no te ha asignado un plan nutricional.
          </div>
        </div>
      ) : (
        <>
          {/* Cabecera del plan */}
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="card-body" style={{ padding: 'var(--space-5)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)', marginBottom: 'var(--space-1)' }}>Objetivo</div>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>
                    {OBJETIVO_LABELS[plan.objetivo_nutricional ?? ''] ?? plan.objetivo_nutricional ?? '—'}
                  </div>
                </div>
                {plan.distribucion_macros && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)', marginBottom: 'var(--space-1)' }}>Distribución</div>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{plan.distribucion_macros}</div>
                  </div>
                )}
                <span className="badge badge-accent">Plan activo</span>
              </div>
            </div>
          </div>

          {/* Meta calórica */}
          {plan.calorias_meta && (
            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
              <div className="card-head">
                <div className="card-title">Meta calórica diaria</div>
              </div>
              <div className="card-body" style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
                <div style={{ fontSize: '52px', fontWeight: 900, color: 'var(--accent)', lineHeight: 1, marginBottom: 'var(--space-2)' }}>
                  {Math.round(Number(plan.calorias_meta))}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>kcal / día</div>
              </div>
            </div>
          )}

          {/* Macros */}
          {(plan.proteinas_g || plan.carbos_g || plan.grasas_g) && (
            <div className="card">
              <div className="card-head">
                <div className="card-title">Macronutrientes</div>
                <div className="card-subtitle">Gramos por día</div>
              </div>
              <div className="card-body" style={{ padding: 'var(--space-5)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Proteínas', value: plan.proteinas_g, color: '#60A5FA', unit: 'g', cal: plan.proteinas_g ? Math.round(Number(plan.proteinas_g) * 4) : null },
                    { label: 'Carbohidratos', value: plan.carbos_g, color: '#F59E0B', unit: 'g', cal: plan.carbos_g ? Math.round(Number(plan.carbos_g) * 4) : null },
                    { label: 'Grasas', value: plan.grasas_g, color: '#F87171', unit: 'g', cal: plan.grasas_g ? Math.round(Number(plan.grasas_g) * 9) : null },
                  ].map(({ label, value, color, unit, cal }) => (
                    <div key={label} style={{ flex: 1, minWidth: '130px', background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 'var(--radius)', padding: 'var(--space-4)', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 'var(--space-2)' }}>{label}</div>
                      <div style={{ fontSize: '32px', fontWeight: 900, color, lineHeight: 1 }}>{value ? Math.round(Number(value)) : '—'}</div>
                      <div style={{ fontSize: '12px', color, opacity: 0.7 }}>{unit}{cal ? ` · ${cal} kcal` : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
