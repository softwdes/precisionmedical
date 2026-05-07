import { createClient } from '@/lib/supabase-server';

// In-memory cache: 5-minute TTL per trainer
const cachedContext: Record<string, { prompt: string; ts: number }> = {};
const CACHE_TTL = 5 * 60 * 1000;

type StudentRef = { full_name: string } | null;

export async function buildSystemPrompt(trainerId: string): Promise<string> {
  const now = Date.now();
  const cached = cachedContext[trainerId];
  if (cached && now - cached.ts < CACHE_TTL) {
    return cached.prompt;
  }

  const supabase = await createClient();
  const hoy = new Date().toISOString().split('T')[0] as string;
  const in7Days  = new Date(Date.now() +  7 * 86400000).toISOString().split('T')[0] as string;
  const in14Days = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0] as string;
  const ago28    = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0] as string;
  const ago90    = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0] as string;
  const mesActual = hoy.slice(0, 7); // YYYY-MM

  // ── Step 1: active students (IDs needed to scope all subsequent queries) ──
  const { data: alumnos } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('trainer_id', trainerId)
    .is('archived_at', null);

  const alumnoIds = (alumnos ?? []).map((a) => a.id as string);

  if (alumnoIds.length === 0) {
    const prompt = buildEmptyPrompt(trainerId);
    cachedContext[trainerId] = { prompt, ts: now };
    return prompt;
  }

  // ── Step 2: all queries in parallel, scoped to trainer's students ──
  const [
    { data: cuotasVencidas },
    { data: cuotasProximas },
    { data: cuotasMes },
    { data: clasesHoy },
    { data: clasesProximas },
    { data: sesiones },
    { data: planesNutricion },
    { data: rutinasActivas },
    { data: medidasRecientes },
  ] = await Promise.all([
    // Overdue payments
    supabase
      .from('cuotas')
      .select('monto, fecha_vencimiento, alumno_id, students(full_name)')
      .eq('trainer_id', trainerId)
      .eq('estado', 'vencido')
      .order('fecha_vencimiento', { ascending: true }),

    // Payments due in next 7 days
    supabase
      .from('cuotas')
      .select('monto, fecha_vencimiento, alumno_id, students(full_name)')
      .eq('trainer_id', trainerId)
      .eq('estado', 'pendiente')
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', in7Days),

    // Current month paid invoices (for reporte de cobros)
    supabase
      .from('cuotas')
      .select('monto, fecha_pago, alumno_id, students(full_name)')
      .eq('trainer_id', trainerId)
      .eq('estado', 'pagado')
      .gte('fecha_pago', `${mesActual}-01`),

    // Today's classes with student assignments
    supabase
      .from('clases')
      .select('titulo, hora_inicio, hora_fin, tipo, clase_alumnos(alumno_id)')
      .eq('trainer_id', trainerId)
      .eq('fecha', hoy)
      .order('hora_inicio'),

    // Upcoming classes next 14 days with student assignments
    supabase
      .from('clases')
      .select('titulo, fecha, hora_inicio, hora_fin, tipo, clase_alumnos(alumno_id)')
      .eq('trainer_id', trainerId)
      .gt('fecha', hoy)
      .lte('fecha', in14Days)
      .order('fecha')
      .order('hora_inicio'),

    // Training sessions last 28 days (for adherencia)
    supabase
      .from('sesiones_entrenamiento')
      .select('alumno_id, completada, fecha')
      .in('alumno_id', alumnoIds)
      .gte('fecha', ago28),

    // Active nutrition plans per student
    supabase
      .from('planes_nutricionales')
      .select('alumno_id, calorias_meta, proteinas_g, carbos_g, grasas_g, objetivo_nutricional')
      .in('alumno_id', alumnoIds)
      .eq('activo', true),

    // Active routines per student
    supabase
      .from('rutinas_alumno')
      .select('alumno_id, nombre, fecha_inicio')
      .in('alumno_id', alumnoIds)
      .eq('activo', true),

    // Recent body measurements per student (last 90 days)
    supabase
      .from('medidas_corporales')
      .select('alumno_id, fecha, cintura_cm, cadera_cm, pecho_cm, biceps_cm, muslo_cm')
      .in('alumno_id', alumnoIds)
      .gte('fecha', ago90)
      .order('fecha', { ascending: false }),
  ]);

  // ── Build lookup maps ──────────────────────────────────────────────────────

  // Adherencia por alumno (últimas 4 semanas)
  const sesMap: Record<string, { total: number; ok: number }> = {};
  (sesiones ?? []).forEach((s) => {
    if (!sesMap[s.alumno_id]) sesMap[s.alumno_id] = { total: 0, ok: 0 };
    sesMap[s.alumno_id]!.total++;
    if (s.completada) sesMap[s.alumno_id]!.ok++;
  });

  // Adherencia por alumno (mes actual)
  const sesMesMap: Record<string, { total: number; ok: number }> = {};
  (sesiones ?? []).filter(s => s.fecha.startsWith(mesActual)).forEach((s) => {
    if (!sesMesMap[s.alumno_id]) sesMesMap[s.alumno_id] = { total: 0, ok: 0 };
    sesMesMap[s.alumno_id]!.total++;
    if (s.completada) sesMesMap[s.alumno_id]!.ok++;
  });

  // Nutrición por alumno
  const nutriMap: Record<string, { calorias_meta: number | null; proteinas_g: number | null; carbos_g: number | null; grasas_g: number | null; objetivo_nutricional: string | null }> = {};
  (planesNutricion ?? []).forEach((p) => {
    nutriMap[p.alumno_id] = p;
  });

  // Rutina activa por alumno
  const rutinaMap: Record<string, { nombre: string; fecha_inicio: string }> = {};
  (rutinasActivas ?? []).forEach((r) => {
    rutinaMap[r.alumno_id] = r;
  });

  // Próxima clase por alumno (map alumno_id → earliest upcoming class)
  type ClaseUpcoming = { titulo: string; fecha: string; hora_inicio: string; hora_fin: string; tipo: string };
  const proximaClaseMap: Record<string, ClaseUpcoming> = {};
  (clasesProximas ?? []).forEach((c) => {
    const asignados = (c.clase_alumnos as { alumno_id: string }[] | null) ?? [];
    asignados.forEach(({ alumno_id }) => {
      if (!proximaClaseMap[alumno_id]) {
        proximaClaseMap[alumno_id] = {
          titulo: c.titulo as string,
          fecha: c.fecha as string,
          hora_inicio: c.hora_inicio as string,
          hora_fin: c.hora_fin as string,
          tipo: c.tipo as string,
        };
      }
    });
  });

  // Última medida por alumno
  const medidaMap: Record<string, { fecha: string; cintura_cm: number | null; cadera_cm: number | null; pecho_cm: number | null; biceps_cm: number | null; muslo_cm: number | null }> = {};
  (medidasRecientes ?? []).forEach((m) => {
    if (!medidaMap[m.alumno_id]) medidaMap[m.alumno_id] = m;
  });

  // Clase de hoy por alumno
  const clasehoyMap: Record<string, { titulo: string; hora_inicio: string; hora_fin: string }[]> = {};
  (clasesHoy ?? []).forEach((c) => {
    const asignados = (c.clase_alumnos as { alumno_id: string }[] | null) ?? [];
    asignados.forEach(({ alumno_id }) => {
      if (!clasehoyMap[alumno_id]) clasehoyMap[alumno_id] = [];
      clasehoyMap[alumno_id]!.push({ titulo: c.titulo as string, hora_inicio: c.hora_inicio as string, hora_fin: c.hora_fin as string });
    });
  });

  // ── Global metrics ────────────────────────────────────────────────────────

  const vals = Object.values(sesMap);
  const adherenciaGlobal = vals.length
    ? Math.round((vals.reduce((s, v) => s + (v.total ? v.ok / v.total : 0), 0) / vals.length) * 100)
    : 0;

  const cobradoMes   = (cuotasMes ?? []).reduce((s, c) => s + Number(c.monto), 0);
  const pendienteMes = (cuotasVencidas ?? []).reduce((s, c) => s + Number(c.monto), 0);

  // ── Build prompt strings ──────────────────────────────────────────────────

  const clasesHoyStr = (clasesHoy ?? []).length > 0
    ? (clasesHoy ?? []).map((c) => {
        const asignados = (c.clase_alumnos as { alumno_id: string }[] | null) ?? [];
        const nombres = asignados
          .map(({ alumno_id }) => (alumnos ?? []).find(a => a.id === alumno_id)?.full_name)
          .filter(Boolean).join(', ');
        return `${c.hora_inicio}–${c.hora_fin} ${c.titulo} (${c.tipo})${nombres ? ` — ${nombres}` : ''}`;
      }).join(' | ')
    : 'sin clases hoy';

  const vencidosStr = (cuotasVencidas ?? []).length > 0
    ? (cuotasVencidas ?? []).map((c) =>
        `${(c.students as unknown as StudentRef)?.full_name ?? 'Alumno'} (S/ ${c.monto}, vencida el ${c.fecha_vencimiento})`
      ).join(' | ')
    : 'ninguno';

  const proximosStr = (cuotasProximas ?? []).length > 0
    ? (cuotasProximas ?? []).map((c) =>
        `${(c.students as unknown as StudentRef)?.full_name ?? 'Alumno'} (vence el ${c.fecha_vencimiento}, S/ ${c.monto})`
      ).join(' | ')
    : 'ninguno en los próximos 7 días';

  const cobrosDelMesStr = (cuotasMes ?? []).length > 0
    ? (cuotasMes ?? []).map((c) =>
        `${(c.students as unknown as StudentRef)?.full_name ?? 'Alumno'} pagó S/ ${c.monto} el ${c.fecha_pago}`
      ).join(' | ')
    : 'sin pagos registrados este mes';

  // ── Per-student profiles ──────────────────────────────────────────────────

  const perfilesStr = (alumnos ?? []).map((alumno) => {
    const id = alumno.id as string;
    const nombre = alumno.full_name;

    // Rutina
    const rutina = rutinaMap[id];
    const rutinaStr = rutina
      ? `${rutina.nombre} (desde ${rutina.fecha_inicio})`
      : 'sin rutina asignada';

    // Nutrición
    const nutri = nutriMap[id];
    const nutriStr = nutri
      ? `${nutri.calorias_meta ?? '?'} kcal/día | P:${nutri.proteinas_g ?? '?'}g C:${nutri.carbos_g ?? '?'}g G:${nutri.grasas_g ?? '?'}g${nutri.objetivo_nutricional ? ` (${nutri.objetivo_nutricional})` : ''}`
      : 'sin plan nutricional';

    // Clase hoy
    const clasesHoyAlumno = clasehoyMap[id];
    const claseHoyStr = clasesHoyAlumno && clasesHoyAlumno.length > 0
      ? clasesHoyAlumno.map(c => `${c.hora_inicio}–${c.hora_fin} ${c.titulo}`).join(', ')
      : 'sin clase hoy';

    // Próxima clase
    const proxClase = proximaClaseMap[id];
    const proxClaseStr = proxClase
      ? `${proxClase.fecha} ${proxClase.hora_inicio}–${proxClase.hora_fin} ${proxClase.titulo} (${proxClase.tipo})`
      : 'sin clases próximas (14 días)';

    // Métricas
    const medida = medidaMap[id];
    const medidaStr = medida
      ? (() => {
          const partes: string[] = [];
          if (medida.cintura_cm) partes.push(`cintura ${medida.cintura_cm}cm`);
          if (medida.cadera_cm)  partes.push(`cadera ${medida.cadera_cm}cm`);
          if (medida.pecho_cm)   partes.push(`pecho ${medida.pecho_cm}cm`);
          if (medida.biceps_cm)  partes.push(`bíceps ${medida.biceps_cm}cm`);
          if (medida.muslo_cm)   partes.push(`muslo ${medida.muslo_cm}cm`);
          return `${medida.fecha}: ${partes.join(', ') || 'registrada'}`;
        })()
      : 'sin medidas en últimos 90 días';

    // Adherencia individual
    const adh28 = sesMap[id];
    const adh28Str = adh28
      ? `${Math.round((adh28.ok / adh28.total) * 100)}% (${adh28.ok}/${adh28.total} sesiones, 28d)`
      : 'sin sesiones registradas';

    const adhMes = sesMesMap[id];
    const adhMesStr = adhMes
      ? `${Math.round((adhMes.ok / adhMes.total) * 100)}% este mes (${adhMes.ok}/${adhMes.total})`
      : 'sin sesiones este mes';

    // Cuota
    const cuotaVenc = (cuotasVencidas ?? []).find(c => c.alumno_id === id);
    const cuotaProx = (cuotasProximas ?? []).find(c => c.alumno_id === id);
    const cuotaStr = cuotaVenc
      ? `VENCIDA S/ ${cuotaVenc.monto} (${cuotaVenc.fecha_vencimiento})`
      : cuotaProx
        ? `vence ${cuotaProx.fecha_vencimiento} S/ ${cuotaProx.monto}`
        : 'al día';

    return `
  ${nombre}
    · Rutina: ${rutinaStr}
    · Nutrición: ${nutriStr}
    · Clase hoy: ${claseHoyStr}
    · Próxima clase: ${proxClaseStr}
    · Métricas (última): ${medidaStr}
    · Adherencia: ${adh28Str} | ${adhMesStr}
    · Cuota: ${cuotaStr}`;
  }).join('\n');

  // ── Assemble final prompt ─────────────────────────────────────────────────

  const now2 = new Date();
  const fechaStr = now2.toLocaleDateString('es-PE', { weekday: 'long', month: 'long', day: 'numeric' });
  const horaStr  = now2.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  const prompt = `Sos TrainerAI, el asistente de IA del sistema de gestión de personal trainers.
Respondés en español, de forma concisa y directa (máximo 3-4 oraciones).
Nunca inventés datos. Si no tenés información, decilo claramente.
Sugerí acciones concretas: enviar WhatsApp, registrar pago, asignar rutina.

════ RESUMEN GLOBAL — ${fechaStr} ${horaStr} ════
Alumnos activos: ${(alumnos ?? []).length} (${(alumnos ?? []).map(a => a.full_name).join(', ')})
Adherencia global últimas 4 semanas: ${adherenciaGlobal}%
Clases hoy: ${clasesHoyStr}
Cobrado este mes: S/ ${cobradoMes.toLocaleString()} | Pendiente vencido: S/ ${pendienteMes.toLocaleString()}
Cuotas vencidas: ${vencidosStr}
Próximas a vencer (7 días): ${proximosStr}
Reporte de cobros del mes: ${cobrosDelMesStr}

════ PERFILES POR ALUMNO ════${perfilesStr}

════ LIMITACIONES ════
Solo podés CONSULTAR datos, no modificarlos.
Si el trainer pide crear, registrar, guardar, eliminar o modificar algo, respondé:
"No puedo realizar esa acción directamente. Para [acción] andá a la sección [sección] del sistema."
Nunca confirmes haber realizado una acción de escritura.
Ejemplos:
  Nuevo alumno → "Andá a Alumnos → Nuevo alumno."
  Registrar pago → "Andá a Finanzas → Registrar pago."
  Asignar rutina → "Andá a Rutinas → Asignar rutina."
  Eliminar clase → "Andá a Horarios y eliminala desde ahí."`;

  cachedContext[trainerId] = { prompt, ts: now };
  return prompt;
}

function buildEmptyPrompt(trainerId: string): string {
  const now = new Date();
  const fechaStr = now.toLocaleDateString('es-PE', { weekday: 'long', month: 'long', day: 'numeric' });
  const horaStr  = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  void trainerId;
  return `Sos TrainerAI, el asistente de IA del sistema de gestión de personal trainers.
Respondés en español, de forma concisa y directa.

════ RESUMEN GLOBAL — ${fechaStr} ${horaStr} ════
Alumnos activos: 0 (sin alumnos registrados aún)

No hay datos de alumnos, clases, pagos ni métricas disponibles todavía.
Sugerí al trainer comenzar agregando alumnos desde la sección Alumnos → Nuevo alumno.

Solo podés CONSULTAR datos, no modificarlos.`;
}
