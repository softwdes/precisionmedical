import { createClient } from '@/lib/supabase-server';

// In-memory cache: 5-minute TTL per trainer
const cachedContext: Record<string, { prompt: string; ts: number }> = {};
const CACHE_TTL = 5 * 60 * 1000;

export async function buildSystemPrompt(trainerId: string): Promise<string> {
  const now = Date.now();
  const cached = cachedContext[trainerId];
  if (cached && now - cached.ts < CACHE_TTL) {
    return cached.prompt;
  }

  const supabase = await createClient();
  const hoy = new Date().toISOString().split('T')[0] as string;
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] as string;
  const ago28 = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0] as string;

  // Step 1: get trainer's active students (need IDs to filter subsequent queries)
  const { data: alumnos } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('trainer_id', trainerId)
    .is('archived_at', null);

  const alumnoIds = (alumnos ?? []).map((a) => a.id as string);

  // Step 2: remaining queries in parallel, all scoped to this trainer
  const [
    { data: cuotasVencidas },
    { data: cuotasProximas },
    { data: clasesHoy },
    { data: sesiones },
    { data: ultimasMedidas },
    cobradoRes,
  ] = await Promise.all([
    supabase
      .from('cuotas')
      .select('monto, fecha_vencimiento, students(full_name)')
      .eq('trainer_id', trainerId)
      .eq('estado', 'vencido')
      .order('fecha_vencimiento', { ascending: true }),

    supabase
      .from('cuotas')
      .select('monto, fecha_vencimiento, students(full_name)')
      .eq('trainer_id', trainerId)
      .eq('estado', 'pendiente')
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', in7Days),

    supabase
      .from('clases')
      .select('titulo, hora_inicio, hora_fin, tipo')
      .eq('trainer_id', trainerId)
      .eq('fecha', hoy)
      .order('hora_inicio'),

    alumnoIds.length > 0
      ? supabase
          .from('sesiones_entrenamiento')
          .select('alumno_id, completada')
          .in('alumno_id', alumnoIds)
          .gte('fecha', ago28)
      : Promise.resolve({ data: [] as { alumno_id: string; completada: boolean }[], error: null }),

    alumnoIds.length > 0
      ? supabase
          .from('medidas_corporales')
          .select('alumno_id, fecha, cintura_cm, cadera_cm, students(full_name)')
          .in('alumno_id', alumnoIds)
          .order('fecha', { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] as { alumno_id: string; fecha: string; cintura_cm: number | null; cadera_cm: number | null; students: unknown }[], error: null }),

    supabase
      .from('cuotas')
      .select('monto')
      .eq('trainer_id', trainerId)
      .eq('estado', 'pagado')
      .gte('fecha_pago', `${hoy.slice(0, 7)}-01`),
  ]);

  const cobradoMes = cobradoRes.data?.reduce((s, c) => s + Number(c.monto), 0) ?? 0;
  const pendienteMes = cuotasVencidas?.reduce((s, c) => s + Number(c.monto), 0) ?? 0;

  // Adherencia global últimas 4 semanas (scoped to trainer's students)
  const sesMap: Record<string, { total: number; ok: number }> = {};
  (sesiones ?? []).forEach((s) => {
    if (!sesMap[s.alumno_id]) sesMap[s.alumno_id] = { total: 0, ok: 0 };
    sesMap[s.alumno_id]!.total++;
    if (s.completada) sesMap[s.alumno_id]!.ok++;
  });
  const vals = Object.values(sesMap);
  const adherenciaGlobal = vals.length
    ? Math.round((vals.reduce((s, v) => s + (v.total ? v.ok / v.total : 0), 0) / vals.length) * 100)
    : 0;

  type StudentRef = { full_name: string } | null;

  const vencidosStr =
    cuotasVencidas
      ?.map(
        (c) =>
          `${(c.students as unknown as StudentRef)?.full_name ?? 'Alumno'} (S/ ${c.monto}, vencida el ${c.fecha_vencimiento})`
      )
      .join(' | ') || 'ninguno';

  const proximosStr =
    cuotasProximas
      ?.map(
        (c) =>
          `${(c.students as unknown as StudentRef)?.full_name ?? 'Alumno'} (vence el ${c.fecha_vencimiento})`
      )
      .join(' | ') || 'ninguno';

  const clasesHoyStr =
    clasesHoy
      ?.map((c) => `${c.hora_inicio}–${c.hora_fin} ${c.titulo} (${c.tipo})`)
      .join(' | ') || 'sin clases';

  const medidasStr =
    ultimasMedidas
      ?.map((m) => {
        const nombre = (m.students as unknown as StudentRef)?.full_name ?? 'Alumno';
        const partes: string[] = [];
        if (m.cintura_cm) partes.push(`cintura ${m.cintura_cm}cm`);
        if (m.cadera_cm) partes.push(`cadera ${m.cadera_cm}cm`);
        return `${nombre}: ${partes.join(', ') || 'medidas registradas'} (${m.fecha})`;
      })
      .join(' | ') || 'sin registros recientes';

  const alumnosStr = (alumnos ?? []).map((a) => a.full_name).join(', ') || 'ninguno';

  const now2 = new Date();
  const fechaStr = now2.toLocaleDateString('es-PE', { month: 'long', day: 'numeric' });
  const horaStr = now2.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  const prompt = `Sos TrainerAI, el asistente de IA del sistema de gestión de personal trainers.
Respondés en español, de forma concisa y directa (máximo 3-4 oraciones).
Nunca inventés datos. Si no tenés información suficiente, decilo claramente.
Sugerí acciones concretas: enviar WhatsApp, registrar pago, asignar rutina.

DATOS ACTUALES DEL SISTEMA (actualizados al ${fechaStr} ${horaStr}):
- Alumnos activos (${(alumnos ?? []).length}): ${alumnosStr}
- Adherencia últimas 4 semanas: ${adherenciaGlobal}%
- Clases hoy: ${clasesHoyStr}
- Cobrado este mes: S/ ${cobradoMes.toLocaleString()}
- Pendiente de cobro (vencido): S/ ${pendienteMes.toLocaleString()}
- Cuotas vencidas: ${vencidosStr}
- Próximas a vencer (7 días): ${proximosStr}
- Últimas medidas corporales: ${medidasStr}

LIMITACIONES IMPORTANTES:
- Solo podés CONSULTAR datos, no modificarlos.
- Si el trainer te pide registrar, crear, guardar, eliminar o modificar algo, respondé siempre: "No puedo realizar esa acción directamente. Para [acción solicitada] andá a la sección [sección correspondiente] del sistema."
- Nunca confirmes haber realizado una acción de escritura porque no tenés esa capacidad.
Ejemplos de respuestas correctas:
  "Registrar un alumno nuevo" → "No puedo crear alumnos directamente. Andá a la sección Alumnos → Nuevo alumno."
  "Registrar un pago" → "No puedo registrar pagos directamente. Andá a la sección Pagos → Registrar pago."
  "Asignar una rutina" → "No puedo asignar rutinas directamente. Andá a la sección Rutinas → Asignar rutina."
  "Eliminar una clase" → "No puedo eliminar clases directamente. Andá a la sección Clases y eliminala desde ahí."`;

  cachedContext[trainerId] = { prompt, ts: now };
  return prompt;
}
