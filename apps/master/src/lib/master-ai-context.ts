import { serverClient } from '@precision/db/client';

const cache: Record<string, { prompt: string; ts: number }> = {};
const CACHE_TTL = 5 * 60 * 1000;

export async function buildMasterSystemPrompt(adminId: string): Promise<string> {
  const now = Date.now();
  const cached = cache[adminId];
  if (cached && now - cached.ts < CACHE_TTL) return cached.prompt;

  const supabase = serverClient();
  const hoy = new Date();
  const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const in7Days = new Date(now + 7 * 86400000).toISOString().split('T')[0]!;
  const todayStr = hoy.toISOString().split('T')[0]!;

  const [
    activosRes,
    trialsRes,
    suspendidosRes,
    pagosMesRes,
    pagosVencidosRes,
    trialsVencenRes,
    subsConPlanRes,
    studentsRes,
    iaHoyRes,
  ] = await Promise.all([
    supabase.from('trainer_suscripciones').select('id').eq('estado', 'activo'),
    supabase.from('trainer_suscripciones').select('id').eq('estado', 'trial'),
    supabase.from('trainer_suscripciones').select('id').eq('estado', 'suspendido'),
    supabase.from('master_pagos').select('monto').eq('estado', 'pagado').gte('fecha_pago', inicioMes),
    supabase.from('master_pagos').select('monto, trainers(business_name)').eq('estado', 'vencido'),
    supabase
      .from('trainer_suscripciones')
      .select('trainer_id, fecha_fin_trial, trainers(business_name)')
      .eq('estado', 'trial')
      .not('fecha_fin_trial', 'is', null)
      .lte('fecha_fin_trial', in7Days),
    supabase
      .from('trainer_suscripciones')
      .select('plan_id, estado, planes_saas(nombre)')
      .in('estado', ['activo', 'trial']),
    supabase.from('students').select('trainer_id').is('archived_at', null),
    supabase.from('master_ai_log').select('id').gte('created_at', todayStr),
  ]);

  const countActivos = activosRes.data?.length ?? 0;
  const countTrials = trialsRes.data?.length ?? 0;
  const countSuspendidos = suspendidosRes.data?.length ?? 0;
  const mrrActual = pagosMesRes.data?.reduce((s, p) => s + Number(p.monto), 0) ?? 0;
  const pendiente = pagosVencidosRes.data?.reduce((s, p) => s + Number(p.monto), 0) ?? 0;

  const trainerStudentCount: Record<string, number> = {};
  studentsRes.data?.forEach((s: any) => {
    trainerStudentCount[s.trainer_id] = (trainerStudentCount[s.trainer_id] || 0) + 1;
  });
  const totalAlumnos = studentsRes.data?.length ?? 0;

  const trialsStr = trialsVencenRes.data?.length
    ? trialsVencenRes.data.map((t: any) => `${(t.trainers as any)?.business_name ?? t.trainer_id} (vence: ${t.fecha_fin_trial})`).join(', ')
    : 'ninguno';

  const vencidosStr = pagosVencidosRes.data?.length
    ? pagosVencidosRes.data.map((p: any) => `${(p.trainers as any)?.business_name ?? 'Trainer'}: $${p.monto}`).join(', ')
    : 'ninguno';

  const dist: Record<string, number> = {};
  subsConPlanRes.data?.forEach((s: any) => {
    const nombre = (s.planes_saas as any)?.nombre ?? 'unknown';
    if (s.estado === 'activo') dist[nombre] = (dist[nombre] || 0) + 1;
  });
  const distStr = Object.entries(dist).map(([k, v]) => `${k}: ${v}`).join(', ') || 'sin datos';

  const fechaStr = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  const horaStr = hoy.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const prompt = `Sos MasterAI, el asistente de IA del panel de administración del sistema SAAS de personal trainers.
Respondés en español rioplatense, de forma concisa (máximo 3-4 oraciones). Nunca inventés datos.
Solo podés CONSULTAR datos, no modificarlos.

DATOS ACTUALES DEL SISTEMA (actualizados al ${fechaStr} ${horaStr}):
- Trainers activos: ${countActivos}
- Trainers en trial: ${countTrials}
- Trainers suspendidos: ${countSuspendidos}
- MRR actual: $${mrrActual}
- Cobrado este mes: $${mrrActual}
- Pendiente de cobro: $${pendiente}
- Trials que vencen en 7 días: ${trialsStr}
- Pagos vencidos: ${vencidosStr}
- Distribución planes: ${distStr}
- Total alumnos en el sistema: ${totalAlumnos}
- Consultas IA totales hoy: ${iaHoyRes.data?.length ?? 0}

LIMITACIONES:
- Solo podés CONSULTAR, no modificar datos.
- Si te piden crear, editar o eliminar algo responder: "No puedo realizar esa acción directamente. Usá la sección [sección] del panel master."`;

  cache[adminId] = { prompt, ts: now };
  return prompt;
}
