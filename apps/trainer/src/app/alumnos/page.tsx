import { getStudents } from '@/actions';
import { createClient, getAuthContext } from '@/lib/supabase-server';
import UserMenu from '@/components/UserMenu';
import NewStudentModal from '@/components/NewStudentModal';
import StudentsTable from '@/components/StudentsTable';
import AppSidebar from '@/components/AppSidebar';

export const dynamic = 'force-dynamic';

export default async function StudentsPage() {
  const [students, { supabase, trainerId }] = await Promise.all([getStudents(), getAuthContext()]);

  const studentIds = students.map(s => s.id);

  const [goalsRes, suscripcionRes, cuotasRes] = await Promise.all([
    supabase.from('goals').select('id, label').order('sort_order'),
    supabase
      .from('trainer_suscripciones')
      .select('planes_saas(limite_alumnos)')
      .eq('trainer_id', trainerId)
      .single(),
    studentIds.length > 0
      ? supabase
          .from('cuotas')
          .select('alumno_id, estado, fecha_vencimiento')
          .in('alumno_id', studentIds)
          .order('fecha_vencimiento', { ascending: false })
      : Promise.resolve({ data: [] as { alumno_id: string; estado: string; fecha_vencimiento: string }[] }),
  ]);

  const goalsData = goalsRes.data;
  const goalsMap = Object.fromEntries((goalsData ?? []).map(g => [g.id, g.label]));
  const goalsList = (goalsData ?? []) as { id: string; label: string }[];
  const limiteAlumnos = (suscripcionRes.data?.planes_saas as { limite_alumnos: number | null } | null)?.limite_alumnos;
  const esIlimitado   = suscripcionRes.data != null && limiteAlumnos === null;
  const capacidadMax  = limiteAlumnos ?? 15;
  const restantes     = esIlimitado ? null : Math.max(0, capacidadMax - students.length);
  const cuposAgotados = !esIlimitado && restantes === 0;
  const cuposEscasos  = !esIlimitado && restantes !== null && restantes <= 5 && restantes > 0;
  const chipBg     = cuposAgotados ? 'rgba(239,68,68,0.1)'  : cuposEscasos ? 'rgba(239,159,39,0.1)'  : 'rgba(63,248,200,0.08)';
  const chipBorder = cuposAgotados ? 'rgba(239,68,68,0.28)' : cuposEscasos ? 'rgba(239,159,39,0.28)' : 'rgba(63,248,200,0.2)';
  const chipColor  = cuposAgotados ? '#ef4444'              : cuposEscasos ? '#EF9F27'               : 'var(--accent)';
  const chipText   = esIlimitado   ? '∞ disponibles'         : cuposAgotados ? 'Sin cupos'            : `${restantes} disponibles`;

  // Map: alumno_id -> estado de la cuota más reciente
  const cuotaStatusMap: Record<string, string> = {};
  (cuotasRes.data ?? []).forEach(c => {
    if (!cuotaStatusMap[c.alumno_id]) cuotaStatusMap[c.alumno_id] = c.estado;
  });

  return (
    <div className="app">
      <AppSidebar
        active="alumnos"
        systemStatus={
          <>
            <div className="system-status-row"><span>Alumnos</span><span className="val">{students.length} / {esIlimitado ? '∞' : capacidadMax}</span></div>
            <div className="system-status-row"><span>Suscripción</span><span className="val accent">Activa</span></div>
          </>
        }
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <span className="crumb-active">Alumnos</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Telemetría // 01</span>
            <h1>Gestión de Alumnos</h1>
          </section>

          <div className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Directorio de Alumnos</div>
                <div className="card-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {students.length} alumnos activos
                  <span style={{
                    background: chipBg, border: `1px solid ${chipBorder}`,
                    borderRadius: '4px', padding: '2px 8px',
                    fontSize: '11px', fontWeight: 700, color: chipColor,
                    letterSpacing: '0.05em', lineHeight: 1.5,
                  }}>
                    {chipText}
                  </span>
                </div>
              </div>
              <NewStudentModal />
            </div>
            <StudentsTable students={students} goalsMap={goalsMap} goalsList={goalsList} cuotaStatusMap={cuotaStatusMap} />
          </div>
        </div>
      </main>
    </div>
  );
}
