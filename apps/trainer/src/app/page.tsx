import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';
import DashboardModule, { type DashboardModuleProps } from '@/components/DashboardModule';
import LiveClock from '@/components/LiveClock';
import { getAuthContext } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// ─── Helper ───────────────────────────────────────────────────────────────────

function relTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  let moduleProps: DashboardModuleProps;

  try {
    const { supabase, trainerId } = await getAuthContext();

    const today = new Date().toISOString().split('T')[0] as string;
    const startOfMonth = `${today.slice(0, 7)}-01`;
    const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0] as string;
    const ago28 = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0] as string;
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const [
      alumnosRes,
      cobradoRes,
      clasesRes,
      cuotasVenRes,
      cuotasProxRes,
      actividadRes,
      sesionesRes,
    ] = await Promise.all([
      supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', trainerId)
        .eq('activo', true),
      supabase
        .from('cuotas')
        .select('monto')
        .eq('trainer_id', trainerId)
        .eq('estado', 'pagado')
        .gte('fecha_pago', startOfMonth)
        .lte('fecha_pago', today),
      supabase
        .from('clases')
        .select('id, titulo, hora_inicio, hora_fin, tipo, color')
        .eq('trainer_id', trainerId)
        .eq('fecha', today)
        .order('hora_inicio'),
      supabase
        .from('cuotas')
        .select('id, monto, fecha_vencimiento, students(full_name)')
        .eq('trainer_id', trainerId)
        .eq('estado', 'vencido'),
      supabase
        .from('cuotas')
        .select('id, monto, fecha_vencimiento, students(full_name)')
        .eq('trainer_id', trainerId)
        .eq('estado', 'pendiente')
        .lte('fecha_vencimiento', in5Days),
      supabase
        .from('cuotas')
        .select('id, alumno_id, estado, monto, created_at, students(full_name)')
        .eq('trainer_id', trainerId)
        .gte('created_at', yesterday)
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('sesiones_entrenamiento')
        .select('alumno_id, completada, fecha')
        .gte('fecha', ago28)
        .lte('fecha', today),
    ]);

    // Cobrado este mes
    const cobradoMes = (cobradoRes.data ?? []).reduce((acc, c) => acc + Number(c.monto), 0);

    // Adherencia global
    const sesiones = sesionesRes.data ?? [];
    let adherenciaGlobal: number | null = null;
    if (sesiones.length > 0) {
      const map = new Map<string, { total: number; done: number }>();
      for (const s of sesiones) {
        const prev = map.get(s.alumno_id) ?? { total: 0, done: 0 };
        map.set(s.alumno_id, {
          total: prev.total + 1,
          done: prev.done + (s.completada ? 1 : 0),
        });
      }
      const vals = Array.from(map.values());
      adherenciaGlobal = Math.round(
        vals.reduce((a, v) => a + (v.done / v.total) * 100, 0) / vals.length
      );
    }

    // Weekly adherencia bars (last 4 weeks, oldest→newest)
    const adherenciaSemanal: number[] = [3, 2, 1, 0].map((wk) => {
      const wkStart = new Date(Date.now() - (wk + 1) * 7 * 86400000)
        .toISOString()
        .split('T')[0] as string;
      const wkEnd = new Date(Date.now() - wk * 7 * 86400000)
        .toISOString()
        .split('T')[0] as string;
      const wkSes = sesiones.filter((s) => s.fecha >= wkStart && s.fecha < wkEnd);
      if (wkSes.length === 0) return 0;
      return Math.round((wkSes.filter((s) => s.completada).length / wkSes.length) * 100);
    });

    // Clases completadas vs pendientes
    const nowH = new Date().getHours();
    const nowM = new Date().getMinutes();
    const clasesHoyRaw = clasesRes.data ?? [];
    const clasesCompletadas = clasesHoyRaw.filter((c) => {
      const [h, m] = (c.hora_fin as string).split(':').map(Number);
      return nowH > (h ?? 0) || (nowH === (h ?? 0) && nowM >= (m ?? 0));
    }).length;
    const clasesPendientes = clasesHoyRaw.length - clasesCompletadas;

    const vencidas = cuotasVenRes.data ?? [];
    const proximas = cuotasProxRes.data ?? [];

    const pagosUrgentes: DashboardModuleProps['pagosUrgentes'] = [
      ...vencidas.map((c) => ({
        id: c.id,
        alumnoNombre:
          (c.students as unknown as { full_name: string } | null)?.full_name ?? 'Alumno',
        monto: Number(c.monto),
        fechaVencimiento: c.fecha_vencimiento as string,
        estado: 'vencido',
      })),
      ...proximas.map((c) => ({
        id: c.id,
        alumnoNombre:
          (c.students as unknown as { full_name: string } | null)?.full_name ?? 'Alumno',
        monto: Number(c.monto),
        fechaVencimiento: c.fecha_vencimiento as string,
        estado: 'pendiente',
      })),
    ].slice(0, 5);

    const actividadReciente: DashboardModuleProps['actividadReciente'] = (
      actividadRes.data ?? []
    ).map((c) => ({
      id: c.id,
      tipo: 'pago' as const,
      descripcion: `${
        (c.students as unknown as { full_name: string } | null)?.full_name ?? 'Alumno'
      } — ${
        c.estado === 'pagado'
          ? `pagó S/ ${c.monto}`
          : `cuota S/ ${c.monto} (${c.estado})`
      }`,
      tiempo: relTime(c.created_at as string),
    }));

    moduleProps = {
      trainerId,
      initialMetrics: {
        alumnosActivos: alumnosRes.count ?? 0,
        cobradoMes,
        adherenciaGlobal,
        clasesCompletadas,
        clasesPendientes,
      },
      alertas: {
        cuotasVencidas: vencidas.length,
        cuotasProximas: proximas.length,
        alumnosBajaAdherencia: [],
      },
      clasesHoy: clasesHoyRaw.map((c) => ({
        id: c.id,
        titulo: c.titulo as string,
        hora_inicio: c.hora_inicio as string,
        hora_fin: c.hora_fin as string,
        tipo: c.tipo as string,
        color: (c.color as string | null) ?? 'green',
      })),
      pagosUrgentes,
      actividadReciente,
      adherenciaSemanal,
      capacidadMax: 30,
      metaMensual: 5000,
    };
  } catch {
    moduleProps = {
      trainerId: '',
      initialMetrics: {
        alumnosActivos: 0,
        cobradoMes: 0,
        adherenciaGlobal: null,
        clasesCompletadas: 0,
        clasesPendientes: 0,
      },
      alertas: { cuotasVencidas: 0, cuotasProximas: 0, alumnosBajaAdherencia: [] },
      clasesHoy: [],
      pagosUrgentes: [],
      actividadReciente: [],
      adherenciaSemanal: [0, 0, 0, 0],
      capacidadMax: 30,
      metaMensual: 5000,
    };
  }

  return (
    <div className="app">
      <AppSidebar
        active="dashboard"
        systemStatus={
          <>
            <div className="system-status-row">
              <span>Alumnos</span>
              <span className="val">
                {moduleProps.initialMetrics.alumnosActivos} / {moduleProps.capacidadMax}
              </span>
            </div>
            <div className="system-status-row">
              <span>Clases Hoy</span>
              <span className="val">
                {moduleProps.initialMetrics.clasesCompletadas +
                  moduleProps.initialMetrics.clasesPendientes}
              </span>
            </div>
            <div className="system-status-row">
              <span>Suscripción</span>
              <span className="val accent">Activa</span>
            </div>
          </>
        }
      />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span>{' '}
            <span className="crumb-active">Dashboard</span>
          </div>
          <div className="topbar-right">
            <LiveClock />
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <DashboardModule {...moduleProps} />
        </div>
      </main>
    </div>
  );
}
