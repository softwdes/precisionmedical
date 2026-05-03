import { getAuthContext } from '@/lib/supabase-server';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';
import FinanzasModule from '@/components/FinanzasModule';

export const dynamic = 'force-dynamic';

export default async function FinanzasPage() {
  const { supabase, trainerId } = await getAuthContext();

  const [studentsRes, cuotasRes, waRes, plantillasRes, configRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, phone')
      .eq('trainer_id', trainerId)
      .is('archived_at', null)
      .order('full_name'),
    supabase
      .from('cuotas')
      .select(
        'id, alumno_id, monto, fecha_pago, fecha_vencimiento, periodo, metodo_pago, estado, notas, students(full_name, phone)'
      )
      .eq('trainer_id', trainerId)
      .order('fecha_vencimiento', { ascending: false }),
    supabase
      .from('whatsapp_mensajes')
      .select('id, alumno_id, tipo_mensaje, contenido, fecha_envio, estado, students(full_name)')
      .eq('trainer_id', trainerId)
      .order('fecha_envio', { ascending: false })
      .limit(100),
    supabase
      .from('plantillas_mensaje')
      .select('id, tipo, nombre, contenido')
      .eq('trainer_id', trainerId)
      .eq('activo', true),
    supabase
      .from('config_recordatorios')
      .select('*')
      .eq('trainer_id', trainerId)
      .maybeSingle(),
  ]);

  return (
    <div className="app">
      <AppSidebar
        active="finanzas"
        systemStatus={
          <div className="system-status-row">
            <span>Suscripción</span>
            <span className="val accent">Activa</span>
          </div>
        }
      />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span>{' '}
            <span className="crumb-active">Finanzas</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>
        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Finanzas // 08</span>
            <h1>Finanzas</h1>
          </section>
          <FinanzasModule
            students={studentsRes.data ?? []}
            initialCuotas={(cuotasRes.data ?? []) as unknown as Parameters<typeof FinanzasModule>[0]['initialCuotas']}
            initialWaMensajes={(waRes.data ?? []) as unknown as Parameters<typeof FinanzasModule>[0]['initialWaMensajes']}
            initialPlantillas={plantillasRes.data ?? []}
            initialConfig={configRes.data ?? null}
          />
        </div>
      </main>
    </div>
  );
}
