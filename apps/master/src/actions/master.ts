'use server';

import { serverClient, serviceClient } from '@precision/db/client';
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
  const supabase = serviceClient();

  const { data: trainers } = await supabase
    .from('trainers')
    .select(`id, user_id, business_name, phone, created_at,
      trainer_suscripciones(id, estado, fecha_inicio, fecha_fin_trial, fecha_proximo_pago, metodo_pago,
        planes_saas(id, nombre, precio_mensual, limite_alumnos, limite_ia_diario, incluye_metricas, incluye_whatsapp, incluye_soporte_prioritario, activo, created_at))`)
    .order('created_at', { ascending: false });

  const trainerIds = (trainers || []).map((t: any) => t.id);

  const [studentsRes, authRes] = await Promise.all([
    trainerIds.length
      ? supabase.from('students').select('trainer_id').in('trainer_id', trainerIds).is('archived_at', null)
      : Promise.resolve({ data: [] }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const studentCounts: Record<string, number> = {};
  studentsRes.data?.forEach((s: any) => { studentCounts[s.trainer_id] = (studentCounts[s.trainer_id] || 0) + 1; });

  const emailMap: Record<string, string> = {};
  (authRes.data?.users ?? []).forEach((u: any) => { emailMap[u.id] = u.email ?? ''; });

  return (trainers || []).map((t: any) => ({
    ...t,
    email: emailMap[t.user_id] ?? null,
    phone: t.phone ?? null,
    students_count: studentCounts[t.id] || 0,
    ia_hoy: 0,
    suscripcion: (t.trainer_suscripciones as any[])?.[0] ?? null,
  }));
}

export async function deleteTrainer(trainerId: string, userId: string): Promise<{ error?: string }> {
  try {
    const admin = serviceClient();

    // 1. Collect IDs of child records
    const [studentsRes, classesRes, templatesRes] = await Promise.all([
      admin.from('students').select('id').eq('trainer_id', trainerId),
      admin.from('clases').select('id').eq('trainer_id', trainerId),
      admin.from('rutina_templates').select('id').eq('trainer_id', trainerId),
    ]);
    const studentIds = (studentsRes.data ?? []).map((r: any) => r.id);
    const classIds = (classesRes.data ?? []).map((r: any) => r.id);
    const templateIds = (templatesRes.data ?? []).map((r: any) => r.id);

    // 2. Delete deepest student-owned records
    if (studentIds.length) {
      await Promise.all([
        admin.from('alumnos_datos_fisicos').delete().in('alumno_id', studentIds),
        admin.from('planes_nutricionales').delete().in('alumno_id', studentIds),
        admin.from('historial_peso').delete().in('alumno_id', studentIds),
        admin.from('medidas_corporales').delete().in('alumno_id', studentIds),
        admin.from('logros').delete().in('alumno_id', studentIds),
        admin.from('clase_alumnos').delete().in('alumno_id', studentIds),
        admin.from('rutinas_alumno').delete().in('alumno_id', studentIds),
        admin.from('cuotas').delete().in('alumno_id', studentIds),
      ]);
      await admin.from('students').delete().in('id', studentIds);
    }

    // 3. Delete class records (clase_alumnos by class_id may already be gone; safe to re-run)
    if (classIds.length) {
      await admin.from('clase_alumnos').delete().in('clase_id', classIds);
      await admin.from('clases').delete().in('id', classIds);
    }

    // 4. Delete rutina template hierarchy
    if (templateIds.length) {
      const { data: dias } = await admin.from('template_dias').select('id').in('template_id', templateIds);
      const diaIds = (dias ?? []).map((d: any) => d.id);
      if (diaIds.length) await admin.from('template_ejercicios').delete().in('dia_id', diaIds);
      await admin.from('template_dias').delete().in('template_id', templateIds);
      await admin.from('rutina_templates').delete().in('id', templateIds);
    }

    // 5. Delete trainer-level records
    await Promise.all([
      admin.from('plantillas_mensaje').delete().eq('trainer_id', trainerId),
      admin.from('config_recordatorios').delete().eq('trainer_id', trainerId),
      admin.from('trainer_suscripciones').delete().eq('trainer_id', trainerId),
    ]);

    // 6. Delete trainer row, then auth user
    const { error: delErr } = await admin.from('trainers').delete().eq('id', trainerId);
    if (delErr) return { error: delErr.message };
    if (userId) await admin.auth.admin.deleteUser(userId);

    revalidatePath('/master/trainers');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
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

// ── Demo-data seed ─────────────────────────────────────────────────────────
async function seedDemoData(supabase: ReturnType<typeof serviceClient>, trainerId: string) {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().split('T')[0]!;
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };
  const daysAhead = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
  const nextWeekday = (dow: number) => {
    const d = new Date(today);
    const diff = (dow - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return iso(d);
  };

  // ── 1. Alumnos ────────────────────────────────────────────────────────
  const { data: students } = await supabase
    .from('students')
    .insert([
      { trainer_id: trainerId, full_name: 'María García', experience_level: 'intermediate', goals: ['Pérdida de grasa', 'Tonificación'], available_equipment: 'full_gym' },
      { trainer_id: trainerId, full_name: 'Carlos López', experience_level: 'beginner', goals: ['Ganar masa muscular'], available_equipment: 'home_basic' },
      { trainer_id: trainerId, full_name: 'Ana Martínez', experience_level: 'advanced', goals: ['Rendimiento deportivo', 'Fuerza'], available_equipment: 'full_gym' },
    ])
    .select('id');
  if (!students?.length) return;
  const [maria, carlos, ana] = students as any[];

  // ── 2. Cuotas ─────────────────────────────────────────────────────────
  const fechaVenc = daysAhead(30);
  const periodo = fechaVenc.slice(0, 7);
  await supabase.from('cuotas').insert(students.map((s: any) => ({
    trainer_id: trainerId, alumno_id: s.id,
    monto: 5000, fecha_vencimiento: fechaVenc, periodo, estado: 'pendiente',
  })));

  // ── 3. Exercises lookup (librería global) ─────────────────────────────
  const { data: exDB } = await supabase.from('exercises').select('id, muscle_group').eq('activo', true);
  const byGroup: Record<string, string[] | undefined> = {};
  (exDB ?? []).forEach((e: any) => {
    if (!byGroup[e.muscle_group]) byGroup[e.muscle_group] = [];
    byGroup[e.muscle_group]!.push(e.id);
  });
  const pick = (g: string, n: number): (string | null)[] => {
    const ids = byGroup[g] ?? [];
    const result = ids.slice(0, n);
    while (result.length < n) (result as (string | null)[]).push(null); // placeholder si no hay suficientes
    return result;
  };

  // ── 4. Rutina Templates ───────────────────────────────────────────────
  type DiaSpec = { nombre: string; orden: number; grupos: [string, number][] };
  type TplSpec = { nombre: string; nivel: string; objetivo: string; dias_semana: number; duracion_semanas: number; sets: number; reps: string; descanso: number; dias: DiaSpec[] };

  const TEMPLATES: TplSpec[] = [
    {
      nombre: 'Principiante — Cuerpo Completo', nivel: 'Principiante',
      objetivo: 'Acondicionamiento general', dias_semana: 3, duracion_semanas: 4,
      sets: 3, reps: '10-12', descanso: 60,
      dias: [
        { nombre: 'Día 1 — Cuerpo Completo A', orden: 1, grupos: [['Piernas', 2], ['Pecho', 1], ['Core', 1]] },
        { nombre: 'Día 2 — Cuerpo Completo B', orden: 2, grupos: [['Piernas', 2], ['Hombros', 1], ['Core', 1]] },
        { nombre: 'Día 3 — Cuerpo Completo C', orden: 3, grupos: [['Espalda', 2], ['Bíceps', 1], ['Core', 1]] },
      ],
    },
    {
      nombre: 'Intermedio — Push / Pull / Legs', nivel: 'Intermedio',
      objetivo: 'Hipertrofia', dias_semana: 4, duracion_semanas: 4,
      sets: 4, reps: '8-12', descanso: 90,
      dias: [
        { nombre: 'Día 1 — Pecho y Tríceps', orden: 1, grupos: [['Pecho', 3], ['Tríceps', 2]] },
        { nombre: 'Día 2 — Espalda y Bíceps', orden: 2, grupos: [['Espalda', 3], ['Bíceps', 2]] },
        { nombre: 'Día 3 — Piernas', orden: 3, grupos: [['Piernas', 3], ['Glúteos', 2]] },
        { nombre: 'Día 4 — Hombros y Core', orden: 4, grupos: [['Hombros', 3], ['Core', 2]] },
      ],
    },
    {
      nombre: 'Avanzado — 5 Días Especializado', nivel: 'Avanzado',
      objetivo: 'Fuerza e Hipertrofia', dias_semana: 5, duracion_semanas: 6,
      sets: 5, reps: '5-8', descanso: 120,
      dias: [
        { nombre: 'Día 1 — Pecho', orden: 1, grupos: [['Pecho', 4], ['Core', 1]] },
        { nombre: 'Día 2 — Espalda', orden: 2, grupos: [['Espalda', 5]] },
        { nombre: 'Día 3 — Piernas A', orden: 3, grupos: [['Piernas', 4], ['Glúteos', 1]] },
        { nombre: 'Día 4 — Hombros y Brazos', orden: 4, grupos: [['Hombros', 3], ['Bíceps', 1], ['Tríceps', 1]] },
        { nombre: 'Día 5 — Full Body / Core', orden: 5, grupos: [['Piernas', 2], ['Espalda', 1], ['Core', 2]] },
      ],
    },
  ];

  for (const tpl of TEMPLATES) {
    const { data: tmpl } = await supabase
      .from('rutina_templates')
      .insert({ trainer_id: trainerId, nombre: tpl.nombre, nivel: tpl.nivel, objetivo: tpl.objetivo, dias_semana: tpl.dias_semana, duracion_semanas: tpl.duracion_semanas, activo: true })
      .select('id').single();
    if (!tmpl) continue;

    for (const dia of tpl.dias) {
      const { data: diaRow } = await supabase
        .from('template_dias')
        .insert({ template_id: tmpl.id, nombre: dia.nombre, orden: dia.orden })
        .select('id').single();
      if (!diaRow) continue;

      const ejercicios: object[] = [];
      let orden = 1;
      for (const [grupo, cantidad] of dia.grupos) {
        for (const eid of pick(grupo, cantidad)) {
          ejercicios.push({ dia_id: diaRow.id, ejercicio_id: eid, orden: orden++, sets: tpl.sets, reps: tpl.reps, descanso_seg: tpl.descanso });
        }
      }
      if (ejercicios.length) await supabase.from('template_ejercicios').insert(ejercicios);
    }
  }

  // ── 5. Horarios (Clases) ──────────────────────────────────────────────
  const { data: clases } = await supabase.from('clases').insert([
    { trainer_id: trainerId, titulo: 'Sesión Personal — María García', fecha: nextWeekday(1), hora_inicio: '08:00', hora_fin: '09:00', tipo: 'personal', color: 'green', recurrencia: 'ninguna' },
    { trainer_id: trainerId, titulo: 'Clase Grupal Principiantes', fecha: nextWeekday(3), hora_inicio: '10:00', hora_fin: '11:00', tipo: 'grupal', color: 'blue', recurrencia: 'ninguna' },
    { trainer_id: trainerId, titulo: 'Evaluación Inicial — Carlos López', fecha: nextWeekday(5), hora_inicio: '09:00', hora_fin: '09:45', tipo: 'evaluacion', color: 'purple', recurrencia: 'ninguna' },
  ]).select('id');

  if (clases?.length && maria && carlos) {
    const vinculos: object[] = [];
    if (clases[0]) vinculos.push({ clase_id: clases[0].id, alumno_id: maria.id });
    if (clases[1]) { vinculos.push({ clase_id: clases[1].id, alumno_id: maria.id }); vinculos.push({ clase_id: clases[1].id, alumno_id: carlos.id }); }
    if (clases[2]) vinculos.push({ clase_id: clases[2].id, alumno_id: carlos.id });
    if (vinculos.length) await supabase.from('clase_alumnos').insert(vinculos);
  }

  // ── 6. Nutrición y datos físicos ──────────────────────────────────────
  if (maria) {
    await supabase.from('alumnos_datos_fisicos').insert({ alumno_id: maria.id, peso_kg: 62, altura_cm: 165, edad: 28, sexo: 'f', nivel_actividad: 'moderado' });
    await supabase.from('planes_nutricionales').insert({ alumno_id: maria.id, objetivo_nutricional: 'Pérdida de grasa', distribucion_macros: '40/30/30', proteinas_g: 165, carbos_g: 124, grasas_g: 55, calorias_meta: 1650, activo: true });
    await supabase.from('historial_peso').insert([
      { alumno_id: maria.id, peso_kg: 64.0, fecha: daysAgo(60) },
      { alumno_id: maria.id, peso_kg: 63.0, fecha: daysAgo(30) },
      { alumno_id: maria.id, peso_kg: 62.0, fecha: iso(today) },
    ]);
    await supabase.from('medidas_corporales').insert([
      { alumno_id: maria.id, fecha: daysAgo(30), cintura_cm: 72, cadera_cm: 98, muslo_cm: 58 },
      { alumno_id: maria.id, fecha: iso(today), cintura_cm: 70, cadera_cm: 96, muslo_cm: 57 },
    ]);
  }

  if (carlos) {
    await supabase.from('alumnos_datos_fisicos').insert({ alumno_id: carlos.id, peso_kg: 75, altura_cm: 178, edad: 24, sexo: 'm', nivel_actividad: 'ligero' });
    await supabase.from('planes_nutricionales').insert({ alumno_id: carlos.id, objetivo_nutricional: 'Ganancia muscular', distribucion_macros: '35/45/20', proteinas_g: 262, carbos_g: 337, grasas_g: 66, calorias_meta: 3000, activo: true });
    await supabase.from('historial_peso').insert([
      { alumno_id: carlos.id, peso_kg: 74.0, fecha: daysAgo(30) },
      { alumno_id: carlos.id, peso_kg: 75.0, fecha: iso(today) },
    ]);
    await supabase.from('medidas_corporales').insert([
      { alumno_id: carlos.id, fecha: daysAgo(30), pecho_cm: 98, biceps_cm: 36 },
      { alumno_id: carlos.id, fecha: iso(today), pecho_cm: 100, biceps_cm: 38 },
    ]);
    await supabase.from('logros').insert({ alumno_id: carlos.id, tipo: 'hito_semana', titulo: 'Primera semana completa', descripcion: 'Completó su primera semana de entrenamiento sin faltar ni un día.', fecha_obtenido: iso(today) });
  }

  if (ana) {
    await supabase.from('alumnos_datos_fisicos').insert({ alumno_id: ana.id, peso_kg: 58, altura_cm: 162, edad: 31, sexo: 'f', nivel_actividad: 'muy_activo' });
    await supabase.from('planes_nutricionales').insert({ alumno_id: ana.id, objetivo_nutricional: 'Mantenimiento y rendimiento', distribucion_macros: '35/40/25', proteinas_g: 192, carbos_g: 220, grasas_g: 61, calorias_meta: 2200, activo: true });
    await supabase.from('historial_peso').insert([
      { alumno_id: ana.id, peso_kg: 57.5, fecha: daysAgo(60) },
      { alumno_id: ana.id, peso_kg: 58.0, fecha: daysAgo(30) },
      { alumno_id: ana.id, peso_kg: 58.0, fecha: iso(today) },
    ]);
    await supabase.from('medidas_corporales').insert([
      { alumno_id: ana.id, fecha: daysAgo(30), cintura_cm: 68, biceps_cm: 30 },
      { alumno_id: ana.id, fecha: iso(today), cintura_cm: 67, biceps_cm: 31 },
    ]);
    await supabase.from('logros').insert({ alumno_id: ana.id, tipo: 'record_personal', titulo: 'Nuevo récord en Sentadilla: 80 kg', descripcion: 'Superó su marca personal en sentadilla con barra libre.', fecha_obtenido: iso(today) });
  }

  // ── 7. Plantillas WhatsApp ────────────────────────────────────────────
  await supabase.from('plantillas_mensaje').insert([
    { trainer_id: trainerId, tipo: 'recordatorio_vencimiento', nombre: 'Recordatorio de vencimiento', contenido: 'Hola {nombre}, te recuerdo que tu cuota de ${monto} vence el {fecha_vencimiento}. ¡No te quedes sin acceso a tus rutinas! 💪', activo: true },
    { trainer_id: trainerId, tipo: 'cuota_vencida', nombre: 'Cuota vencida', contenido: 'Hola {nombre}, tu cuota de ${monto} venció el {fecha_vencimiento}. Por favor regularizá tu situación para continuar con tu plan. 🙏', activo: true },
    { trainer_id: trainerId, tipo: 'cobro_realizado', nombre: 'Cobro realizado', contenido: '¡Listo {nombre}! Recibí tu pago de ${monto}. Tu próxima fecha de vencimiento es el {proxima_fecha}. ¡Seguimos! 🔥', activo: true },
    { trainer_id: trainerId, tipo: 'bienvenida', nombre: 'Bienvenida al programa', contenido: '¡Bienvenido/a {nombre}! Es un gusto tenerte en el programa. Desde hoy empezamos tu plan personalizado. Cualquier consulta, acá estoy. 💪', activo: true },
    { trainer_id: trainerId, tipo: 'nueva_rutina', nombre: 'Nueva rutina asignada', contenido: 'Hola {nombre}, ya tenés tu nueva rutina disponible en la app. ¡Entrá y mirala! Cualquier duda me avisás. 🏋️', activo: true },
  ]);

  // ── 8. Config recordatorios ───────────────────────────────────────────
  await supabase.from('config_recordatorios').insert({
    trainer_id: trainerId,
    dias_antes_vencimiento: 5,
    recordatorio_dia_vencimiento: true,
    recordatorio_post_24h: true,
    recordatorio_post_48h: true,
    recordatorio_post_72h: false,
  });
}

// ── Create trainer ─────────────────────────────────────────────────────────
export async function createTrainer(formData: FormData): Promise<{ error?: string; trainer?: TrainerRow }> {
  let userId: string | null = null;
  try {
    const admin = serviceClient();

    const business_name = (formData.get('business_name') as string).trim();
    const phone = ((formData.get('phone') as string | null) ?? '').trim() || null;
    const email = (formData.get('email') as string).trim();
    const password = formData.get('password') as string;
    const confirm = formData.get('confirm') as string;
    const plan_id = formData.get('plan_id') as string;
    const trial_days = parseInt(formData.get('trial_days') as string) || 30;
    const seed_demo = formData.get('seed_demo') === 'true';

    if (!business_name) return { error: 'El nombre del negocio es requerido' };
    if (!phone) return { error: 'El celular es requerido' };
    if (!email) return { error: 'El email es requerido' };
    if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' };
    if (password !== confirm) return { error: 'Las contraseñas no coinciden' };
    if (!plan_id) return { error: 'Selecciona un plan' };

    // 1. Crear usuario en auth
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: business_name },
    });
    if (authErr) return { error: authErr.message };
    userId = authData.user.id;

    // 2. Crear fila en trainers
    const slug = `${business_name
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}`;

    const { data: trainer, error: trainerErr } = await admin
      .from('trainers')
      .insert({ business_name, phone, user_id: userId, slug })
      .select('id, user_id, business_name, phone, created_at')
      .single();

    if (trainerErr) {
      await admin.auth.admin.deleteUser(userId);
      return { error: trainerErr.message };
    }

    // 3. Crear suscripción en trial
    const today = new Date().toISOString().split('T')[0]!;
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trial_days);
    const trialEndStr = trialEnd.toISOString().split('T')[0]!;

    const { data: planData } = await admin
      .from('planes_saas')
      .select('id, nombre, precio_mensual, limite_alumnos, limite_ia_diario, incluye_metricas, incluye_whatsapp, incluye_soporte_prioritario, activo, created_at')
      .eq('id', plan_id)
      .single();

    const { data: sus, error: susErr } = await admin
      .from('trainer_suscripciones')
      .insert({
        trainer_id: trainer.id,
        plan_id,
        estado: 'trial',
        fecha_inicio: today,
        fecha_fin_trial: trialEndStr,
        fecha_proximo_pago: trialEndStr,
      })
      .select('id, trainer_id, plan_id, estado, fecha_inicio, fecha_fin_trial, fecha_proximo_pago, metodo_pago, notas, created_at')
      .single();

    if (susErr) return { error: susErr.message };

    // 4. Sembrar datos de ejemplo
    if (seed_demo) await seedDemoData(admin, trainer.id);

    revalidatePath('/master/trainers');

    return {
      trainer: {
        ...trainer,
        email,
        phone: trainer.phone ?? null,
        students_count: seed_demo ? 3 : 0,
        ia_hoy: 0,
        suscripcion: { ...sus, planes_saas: planData! } as any,
      },
    };
  } catch (e) {
    if (userId) {
      try { await serviceClient().auth.admin.deleteUser(userId); } catch { }
    }
    return { error: (e as Error).message };
  }
}

export async function updateTrainer(trainerId: string, fields: { business_name?: string; phone?: string | null }): Promise<{ error?: string }> {
  try {
    const admin = serviceClient();
    const update: Record<string, unknown> = {};
    if (fields.business_name !== undefined) update.business_name = fields.business_name.trim();
    if (fields.phone !== undefined) update.phone = fields.phone || null;
    if (Object.keys(update).length === 0) return {};
    const { error } = await admin.from('trainers').update(update).eq('id', trainerId);
    if (error) return { error: error.message };
    revalidatePath('/master/trainers');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateTrainerEmail(userId: string, email: string): Promise<{ error?: string }> {
  try {
    const admin = serviceClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { email: email.trim() });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateTrainerPassword(userId: string, password: string): Promise<{ error?: string }> {
  try {
    const admin = serviceClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateTrainerTrial(trainerId: string, fechaFinTrial: string): Promise<{ error?: string }> {
  try {
    const admin = serviceClient();
    const { error } = await admin
      .from('trainer_suscripciones')
      .update({ fecha_fin_trial: fechaFinTrial, fecha_proximo_pago: fechaFinTrial })
      .eq('trainer_id', trainerId);
    if (error) return { error: error.message };
    revalidatePath('/master/trainers');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function resendTrainerAccess(email: string): Promise<{ error?: string; link?: string }> {
  try {
    const admin = serviceClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error) return { error: error.message };
    return { link: (data as any)?.properties?.action_link ?? '' };
  } catch (e) {
    return { error: (e as Error).message };
  }
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
