import { getRutinaData } from '@/actions';

export const dynamic = 'force-dynamic';

export default async function RutinaPage() {
  let rutina: Awaited<ReturnType<typeof getRutinaData>> = null;

  try {
    rutina = await getRutinaData();
  } catch {
    return <div style={{ color: 'var(--fg-muted)', padding: 'var(--space-8)' }}>Error al cargar la rutina.</div>;
  }

  return (
    <>
      <section className="section-head">
        <span className="eyebrow">Entrenamiento // 01</span>
        <h1>Mi Rutina</h1>
      </section>

      {!rutina ? (
        <div className="card">
          <div className="card-body" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--fg-muted)' }}>
            Tu entrenador aún no te ha asignado una rutina.
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">{rutina.nombre}</div>
                <div className="card-subtitle">
                  Desde {new Date(rutina.fecha_inicio).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {rutina.fecha_fin && ` · Hasta ${new Date(rutina.fecha_fin).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                </div>
              </div>
              <span className="badge badge-accent">Activa</span>
            </div>
          </div>

          {(rutina.rutina_dias as any[])
            .sort((a, b) => a.orden - b.orden)
            .map((dia: any) => (
              <div key={dia.id} className="card" style={{ marginBottom: 'var(--space-4)' }}>
                <div className="card-head">
                  <div className="card-head-left">
                    <span className="eyebrow">Día {dia.orden}</span>
                    <div className="card-title">{dia.nombre}</div>
                  </div>
                  <span className="badge">{(dia.rutina_ejercicios as any[]).length} ejercicios</span>
                </div>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Ejercicio</th>
                        <th>Músculo</th>
                        <th>Series</th>
                        <th>Reps</th>
                        <th>Descanso</th>
                        <th>Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dia.rutina_ejercicios as any[])
                        .sort((a: any, b: any) => a.orden - b.orden)
                        .map((ej: any) => (
                          <tr key={ej.id}>
                            <td className="mono" style={{ color: 'var(--fg-muted)' }}>{String(ej.orden).padStart(2, '0')}</td>
                            <td style={{ fontWeight: 600 }}>{ej.exercises?.name ?? '—'}</td>
                            <td className="text-muted">{ej.exercises?.muscle_group ?? '—'}</td>
                            <td style={{ textAlign: 'center' }}>{ej.sets ?? '—'}</td>
                            <td style={{ textAlign: 'center' }}>{ej.reps ?? '—'}</td>
                            <td className="text-muted">{ej.descanso_seg ? `${ej.descanso_seg}s` : '—'}</td>
                            <td className="text-muted" style={{ fontSize: '12px', maxWidth: '180px' }}>{ej.notas ?? '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </>
      )}
    </>
  );
}
