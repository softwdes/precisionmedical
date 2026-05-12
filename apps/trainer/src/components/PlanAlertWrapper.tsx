import { getAuthContext } from '@/lib/supabase-server';
import PlanAlert, { type Plan } from './PlanAlert';

const LABELS: Record<string, string> = { basico: 'Básico', vip: 'VIP', premium: 'Premium' };

export default async function PlanAlertWrapper() {
  try {
    const { supabase, trainerId } = await getAuthContext();

    const { data: { session } } = await supabase.auth.getSession();
    const sessionKey = session?.access_token?.slice(-16) ?? 'fallback';

    const [susRes, planesRes] = await Promise.all([
      supabase
        .from('trainer_suscripciones')
        .select('estado, fecha_fin_trial, fecha_proximo_pago, planes_saas(nombre)')
        .eq('trainer_id', trainerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('planes_saas')
        .select('id, nombre, precio_mensual, limite_alumnos, limite_ia_diario, incluye_metricas, incluye_whatsapp, incluye_soporte_prioritario')
        .eq('activo', true)
        .order('precio_mensual', { ascending: true }),
    ]);

    if (!susRes.data) return null;

    const sus = susRes.data;
    const fechaRef = sus.fecha_proximo_pago ?? sus.fecha_fin_trial;
    if (!fechaRef) return null;

    const diasRestantes = Math.ceil((new Date(fechaRef).getTime() - Date.now()) / 86_400_000);
    if (diasRestantes > 5) return null;

    const ps = sus.planes_saas as { nombre: string } | null;
    const planActualNombre = ps?.nombre ?? '';
    const planLabel = planActualNombre ? (LABELS[planActualNombre] ?? planActualNombre) : 'actual';
    const planes = (planesRes.data ?? []) as Plan[];

    return (
      <PlanAlert
        planNombre={planLabel}
        planActualNombre={planActualNombre}
        diasRestantes={diasRestantes}
        fechaVencimiento={fechaRef}
        planes={planes}
        sessionKey={sessionKey}
      />
    );
  } catch {
    return null;
  }
}
