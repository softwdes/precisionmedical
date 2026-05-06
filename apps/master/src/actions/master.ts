'use server';

import { serverClient } from '@precision/db/client';
import { revalidatePath } from 'next/cache';
import type {
  MasterMetrics, MrrMensual, DistribucionPlan,
  TopTrainer, ActividadReciente, AlertBanners,
  BillingMetrics, ReporteMetrics, TrainerRow, PlanSaas,
} from '@/types/master';

function inicioMes(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function finMes(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset + 1);
  d.setDate(0);
  return d.toISOString().split('T')[0]!;
}

export async function getMasterMetrics(): Promise<MasterMetrics> {
  const supabase = serverClient();

  const [activosRes, trialsRes, activosPrevRes, canceladosRes, pagosMesRes, pagosPrevRes, alumnosRes] =
    await Promise.all([
      supabase.from('trainer_suscripciones').select('id').eq('estado', 'activo'),
      supabase.from('trainer_suscripciones').select('id, fecha_fin_trial').eq('estado', 'trial'),
      supabase.from('trainer_suscripciones').select('id').eq('estado', 'activo').lt('created_at', inicioMes()),
      supabase.from('trainer_suscripciones').select('id').eq('estado', 'cancelado').gte('created_at', inicioMes()),
      supabase.from('master_pagos').select('monto').eq('estado', 'pagado').gte('fecha_pago', inicioMes()),
      supabase.from('master_pagos').select('monto').eq('estado', 'pagado').gte('fecha_pago', inicioMes(1)).lte('fecha_pago', finMes(1)),
      supabase.from('students').select('id', { count: 'exact', head: true }).is('archived_at', null),
    ]);

  const trainersActivos = activosRes.data?.length ?? 0;
  const trainersActivosPrev = activosPrevRes.data?.length ?? 0;
  const trainersTrials = trialsRes.data?.length ?? 0;
  const churnMes = canceladosRes.data?.length ?? 0;
  const mrrActual = pagosMesRes.data?.reduce((s, p) => s + Number(p.monto), 0) ?? 0;
  const mrrPrev = pagosPrevRes.data?.reduce((s, p) => s + Number(p.monto), 0) ?? 0;
  const churnRate = trainersActivos > 0 ? Math.round((churnMes / trainersActivos) * 100) : 0;
  const convRate = trainersTrials > 0 ? Math.round(((trainersActivos - trainersActivosPrev) / trainersTrials) * 100) : 0;

  return {
    trainers_activos: trainersActivos,
    trainers_activos_prev: trainersActivosPrev,
    trainers_trial: trainersTrials,
    trials_conv_rate: Math.max(0, convRate),
    mrr_actual: mrrActual,
    mrr_prev: mrrPrev,
    churn_mes: churnMes,
    churn_rate: churnRate,
    total_alumnos: (alumnosRes as any).count ?? 0,
  };
}

export async function getMrrHistory(): Promise<MrrMensual[]> {
  const supabase = serverClient();
  const months: MrrMensual[] = [];

  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const { data } = await supabase
      .from('master_pagos')
      .select('monto')
      .eq('estado', 'pagado')
      .gte('fecha_pago', `${periodo}-01`)
      .lte('fecha_pago', `${periodo}-31`);

    months.push({
      mes: d.toLocaleDateString('es-AR', { month: 'short' }),
      monto: data?.reduce((s, p) => s + Number(p.monto), 0) ?? 0,
    });
  }
  return months;
}

export async function getPlanDistribution(): Promise<DistribucionPlan[]> {
  const supabase = serverClient();

  const [planesRes, subsRes, trialsRes] = await Promise.all([
    supabase.from('planes_saas').select('id, nombre, precio_mensual').eq('activo', true),
    supabase.from('trainer_suscripciones').select('plan_id').eq('estado', 'activo'),
    supabase.from('trainer_suscripciones').select('id').eq('estado', 'trial'),
  ]);

  const counts: Record<string, number> = {};
  subsRes.data?.forEach((s: any) => {
    counts[s.plan_id] = (counts[s.plan_id] || 0) + 1;
  });

  const total = (subsRes.data?.length ?? 0) + (trialsRes.data?.length ?? 0);
  const PLAN_COLORS: Record<string, string> = { basico: '#6B7472', vip: '#534AB7', premium: '#D4A017' };

  const result: DistribucionPlan[] = (planesRes.data || []).map((p: any) => ({
    plan: p.nombre,
    count: counts[p.id] || 0,
    ingreso: (counts[p.id] || 0) * p.precio_mensual,
    porcentaje: total > 0 ? Math.round(((counts[p.id] || 0) / total) * 100) : 0,
    color: PLAN_COLORS[p.nombre] ?? '#6B7472',
  }));

  result.push({
    plan: 'trial',
    count: trialsRes.data?.length ?? 0,
    ingreso: 0,
    porcentaje: total > 0 ? Math.round(((trialsRes.data?.length ?? 0) / total) * 100) : 0,
    color: '#EF9F27',
  });

  return result;
}

export async function getTopTrainers(limit = 4): Promise<TopTrainer[]> {
  const supabase = serverClient();

  const [trainersRes, studentsRes, subsRes] = await Promise.all([
    supabase.from('trainers').select('id, business_name'),
    supabase.from('students').select('trainer_id').is('archived_at', null),
    supabase.from('trainer_suscripciones').select('trainer_id, planes_saas(nombre, limite_alumnos)').in('estado', ['activo', 'trial']),
  ]);

  const counts: Record<string, number> = {};
  studentsRes.data?.forEach((s: any) => { counts[s.trainer_id] = (counts[s.trainer_id] || 0) + 1; });

  const subMap: Record<string, any> = {};
  subsRes.data?.forEach((s: any) => { subMap[s.trainer_id] = s.planes_saas; });

  return (trainersRes.data || [])
    .map((t: any) => ({
      id: t.id,
      business_name: t.business_name,
      students_count: counts[t.id] || 0,
      plan_nombre: subMap[t.id]?.nombre || 'sin plan',
      max_alumnos: subMap[t.id]?.limite_alumnos ?? null,
    }))
    .sort((a, b) => b.students_count - a.students_count)
    .slice(0, limit);
}

export async function getRecentActivity(limit = 5): Promise<ActividadReciente[]> {
  const supabase = serverClient();
  const { data } = await supabase
    .from('trainer_suscripciones')
    .select('id, estado, created_at, trainers(business_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  const TIPO_MAP: Record<string, ActividadReciente['tipo']> = {
    cancelado: 'cancelacion', trial: 'registro', activo: 'cambio_plan', suspendido: 'suspension',
  };
  const DESC_MAP: Record<string, string> = {
    cancelado: 'Canceló su suscripción',
    trial: 'Inició un período de prueba',
    activo: 'Activó su suscripción',
    suspendido: 'Fue suspendido',
  };

  return (data || []).map((item: any) => ({
    id: item.id,
    tipo: TIPO_MAP[item.estado] ?? 'cambio_plan',
    descripcion: DESC_MAP[item.estado] ?? `Estado: ${item.estado}`,
    trainer_name: (item.trainers as any)?.business_name ?? 'Trainer',
    created_at: item.created_at,
  }));
}

export async function getAlertBanners(): Promise<AlertBanners> {
  const supabase = serverClient();
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]!;

  const [trialsRes, vencidosRes] = await Promise.all([
    supabase.from('trainer_suscripciones').select('id').eq('estado', 'trial').not('fecha_fin_trial', 'is', null).lte('fecha_fin_trial', in7Days),
    supabase.from('master_pagos').select('id').eq('estado', 'vencido'),
  ]);

  const t = trialsRes.data?.length ?? 0;
  const v = vencidosRes.data?.length ?? 0;

  return { trials_vencen: t, pagos_vencidos: v, sin_actividad: 0, show: t > 0 || v > 0 };
}

export async function getMasterTrainers(): Promise<TrainerRow[]> {
  const supabase = serverClient();

  const { data: trainers } = await supabase
    .from('trainers')
    .select(`id, user_id, business_name, created_at,
      trainer_suscripciones(id, estado, fecha_inicio, fecha_fin_trial, fecha_proximo_pago, metodo_pago,
        planes_saas(id, nombre, precio_mensual, limite_alumnos, limite_ia_diario, incluye_metricas, incluye_whatsapp, incluye_soporte_prioritario, activo, created_at))`)
    .order('created_at', { ascending: false });

  const trainerIds = (trainers || []).map((t: any) => t.id);

  const [studentsRes, usersRes] = await Promise.all([
    supabase.from('students').select('trainer_id').in('trainer_id', trainerIds).is('archived_at', null),
    supabase.from('trainers').select('id, user_id'),
  ]);

  const studentCounts: Record<string, number> = {};
  studentsRes.data?.forEach((s: any) => { studentCounts[s.trainer_id] = (studentCounts[s.trainer_id] || 0) + 1; });

  return (trainers || []).map((t: any) => ({
    ...t,
    email: null,
    phone: null,
    students_count: studentCounts[t.id] || 0,
    ia_hoy: 0,
    suscripcion: (t.trainer_suscripciones as any[])?.[0] ?? null,
  }));
}

export async function getPlanes(): Promise<PlanSaas[]> {
  const supabase = serverClient();

  const [planesRes, subsRes] = await Promise.all([
    supabase.from('planes_saas').select('*').eq('activo', true).order('precio_mensual'),
    supabase.from('trainer_suscripciones').select('plan_id').eq('estado', 'activo'),
  ]);

  const counts: Record<string, number> = {};
  subsRes.data?.forEach((s: any) => { counts[s.plan_id] = (counts[s.plan_id] || 0) + 1; });

  return (planesRes.data || []).map((p: any) => ({
    ...p,
    trainers_count: counts[p.id] || 0,
    ingreso_mensual: (counts[p.id] || 0) * p.precio_mensual,
  }));
}

export async function getBillingHistory(periodo?: string) {
  const supabase = serverClient();
  let query = supabase
    .from('master_pagos')
    .select(`id, monto, fecha_pago, periodo, estado, metodo_pago, trainers(business_name), planes_saas(nombre)`)
    .order('fecha_pago', { ascending: false });
  if (periodo) query = query.like('periodo', `${periodo}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as any[];
}

export async function getBillingMetrics(): Promise<BillingMetrics> {
  const supabase = serverClient();

  const [cobradoRes, pendientesRes, activosRes] = await Promise.all([
    supabase.from('master_pagos').select('monto').eq('estado', 'pagado').gte('fecha_pago', inicioMes()),
    supabase.from('master_pagos').select('monto, id').in('estado', ['pendiente', 'vencido']),
    supabase.from('trainer_suscripciones').select('plan_id, planes_saas(precio_mensual)').eq('estado', 'activo'),
  ]);

  const cobrado = cobradoRes.data?.reduce((s, p) => s + Number(p.monto), 0) ?? 0;
  const pendienteTotal = pendientesRes.data?.reduce((s, p) => s + Number(p.monto), 0) ?? 0;
  const mrrBase = activosRes.data?.reduce((s: number, a: any) => s + Number(a.planes_saas?.precio_mensual ?? 0), 0) ?? 0;

  return {
    cobrado_mes: cobrado,
    pendiente_total: pendienteTotal,
    pendiente_count: pendientesRes.data?.length ?? 0,
    arr: mrrBase * 12,
  };
}

export async function getReporteMetrics(): Promise<ReporteMetrics> {
  const supabase = serverClient();
  const hoy = new Date().toISOString().split('T')[0]!;

  const [activosRes, trialsRes, canceladosRes, pagosMesRes, alumnosRes, rutinasRes, clasesRes, iaRes] =
    await Promise.all([
      supabase.from('trainer_suscripciones').select('plan_id, planes_saas(precio_mensual)').eq('estado', 'activo'),
      supabase.from('trainer_suscripciones').select('id').eq('estado', 'trial'),
      supabase.from('trainer_suscripciones').select('id').eq('estado', 'cancelado').gte('created_at', inicioMes()),
      supabase.from('master_pagos').select('monto').eq('estado', 'pagado').gte('fecha_pago', inicioMes()),
      supabase.from('students').select('id', { count: 'exact', head: true }).is('archived_at', null),
      supabase.from('rutinas_alumno').select('id', { count: 'exact', head: true }).gte('fecha_inicio', inicioMes()),
      supabase.from('clases').select('id', { count: 'exact', head: true }).eq('fecha', hoy),
      supabase.from('master_ai_log').select('id', { count: 'exact', head: true }).gte('created_at', hoy),
    ]);

  const trainersActivos = activosRes.data?.length ?? 0;
  const trainersTrials = trialsRes.data?.length ?? 0;
  const churnMes = canceladosRes.data?.length ?? 0;
  const mrrBase = activosRes.data?.reduce((s: number, a: any) => s + Number(a.planes_saas?.precio_mensual ?? 0), 0) ?? 0;
  const mrrActual = pagosMesRes.data?.reduce((s, p) => s + Number(p.monto), 0) ?? 0;

  return {
    conversion_trial: trainersTrials > 0 ? ((trainersActivos * 0.3 / trainersTrials) * 100).toFixed(1) : '0.0',
    churn_rate: trainersActivos > 0 ? ((churnMes / trainersActivos) * 100).toFixed(1) : '0.0',
    ltv_promedio: trainersActivos > 0 ? Math.round((mrrBase / trainersActivos) * 12) : 0,
    ticket_promedio: trainersActivos > 0 ? Math.round(mrrActual / trainersActivos) : 0,
    arr_proyectado: mrrBase * 12,
    nps_estimado: 72,
    ia_consultas_hoy: (iaRes as any).count ?? 0,
    total_alumnos: (alumnosRes as any).count ?? 0,
    rutinas_mes: (rutinasRes as any).count ?? 0,
    whatsapp_enviados: 0,
    clases_hoy: (clasesRes as any).count ?? 0,
    uptime: 99.9,
  };
}

export async function changeTrainerPlan(trainerId: string, planId: string): Promise<{ error?: string }> {
  try {
    const supabase = serverClient();
    const { error } = await supabase.from('trainer_suscripciones').update({ plan_id: planId }).eq('trainer_id', trainerId);
    if (error) return { error: error.message };
    revalidatePath('/master/trainers');
    return {};
  } catch (e) { return { error: (e as Error).message }; }
}

export async function toggleTrainerStatus(trainerId: string, newStatus: 'activo' | 'suspendido'): Promise<{ error?: string }> {
  try {
    const supabase = serverClient();
    const { error } = await supabase.from('trainer_suscripciones').update({ estado: newStatus }).eq('trainer_id', trainerId);
    if (error) return { error: error.message };
    revalidatePath('/master/trainers');
    return {};
  } catch (e) { return { error: (e as Error).message }; }
}
