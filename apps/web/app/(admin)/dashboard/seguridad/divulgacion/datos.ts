import 'server-only';
import { clienteClinica } from '@/lib/cifo/phoenix';
import { ACCIONES_DIVULGACION, type Divulgacion, type DatosDivulgacion } from './modelo';

/**
 * El registro de divulgación: quién miró la ficha, la foto o la bandeja de otro.
 *
 * ── Por qué está separado del Centro de Seguridad ──────────────────────────
 *
 * Son dos preguntas distintas y mezclarlas deja la pantalla inservible para las
 * dos. El Centro de Seguridad contesta "¿quién intenta entrar sin permiso?" y
 * lee el proyecto **Admin**. Esto contesta "¿quién de los nuestros vio lo que no
 * le correspondía?" y lee **Phoenix**, la base clínica. Una es el perímetro; la
 * otra es HIPAA.
 *
 * ── De dónde salen las credenciales ────────────────────────────────────────
 *
 * De `clienteClinica()`, que ya existía: es el mismo puente Admin → clínica que
 * usan las métricas por empleado y la Carrera, y ya está en producción. No se
 * abre uno nuevo ni se piden variables nuevas.
 *
 * ── La advertencia que hay que tener presente ──────────────────────────────
 *
 * Esta pantalla **contiene PHI**: nombres de pacientes junto a quién los miró.
 * Es inevitable —un registro de divulgación sin decir de quién no sirve para
 * nada— y por eso el permiso es `super_admin` y nada más. Mirar esta pantalla
 * es, en sí mismo, acceder a PHI.
 */

const LIMITE = 500;

/** Resuelve nombres en lote, para no hacer una consulta por fila. */
async function nombres(
  cliente: ReturnType<typeof clienteClinica>,
  tabla: 'users' | 'patients',
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await cliente
    .from(tabla)
    .select('id, firstName, lastName')
    .in('id', ids);
  if (error) {
    console.error(`[divulgacion] no se pudo leer ${tabla}:`, error.message);
    return new Map();
  }
  return new Map(
    (data ?? []).map((r) => [
      r.id as string,
      [r.firstName, r.lastName].filter(Boolean).join(' ') || (r.id as string),
    ]),
  );
}

export async function leerDivulgacion(desde: string, hasta: string): Promise<DatosDivulgacion> {
  const vacio: DatosDivulgacion = { eventos: [], desde, hasta, ok: false };

  let cliente: ReturnType<typeof clienteClinica>;
  try {
    cliente = clienteClinica();
  } catch (err) {
    // Sin las credenciales de la clínica esto no puede funcionar, y decirlo es
    // mejor que mostrar una tabla vacía que se lee como "no pasó nada".
    console.error('[divulgacion] faltan las credenciales de la clínica:', err);
    return vacio;
  }

  const { data, error } = await cliente
    .from('audit_logs')
    .select('action, actorUserId, actorRole, entityType, entityId, ipAddress, metadata, createdAt')
    .in('action', ACCIONES_DIVULGACION as unknown as string[])
    .gte('createdAt', desde)
    .lt('createdAt', hasta)
    .order('createdAt', { ascending: false })
    .limit(LIMITE);

  if (error || !data) {
    console.error('[divulgacion] no se pudo leer el registro:', error?.message);
    return vacio;
  }

  /*
   * Quién miró sale de `users` de PHOENIX, no del Admin: el `actorUserId` de
   * estas filas es un id de la base clínica. Buscarlo en el Admin devuelve
   * vacío sin error, que es la peor forma de equivocarse.
   */
  const idsActores = [...new Set(data.map((r) => r.actorUserId as string).filter(Boolean))];

  /*
   * A quién miraron depende de la acción. `entityType` viene con mayúsculas
   * distintas según quién escribió la fila (`User`, `patients`, `Patient`…),
   * así que se compara en minúsculas.
   */
  const esPaciente = (t: unknown): boolean => String(t ?? '').toLowerCase().startsWith('patient');
  const idsPacientes = [...new Set(
    data.filter((r) => esPaciente(r.entityType)).map((r) => r.entityId as string).filter(Boolean),
  )];
  const idsUsuarios = [...new Set(
    data.filter((r) => !esPaciente(r.entityType)).map((r) => r.entityId as string).filter(Boolean),
  )];

  const [quienes, pacientes, usuarios] = await Promise.all([
    nombres(cliente, 'users', idsActores),
    nombres(cliente, 'patients', idsPacientes),
    nombres(cliente, 'users', idsUsuarios),
  ]);

  const eventos: Divulgacion[] = data.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const idObjetivo = (r.entityId as string) ?? '';
    const paciente = esPaciente(r.entityType);
    return {
      accion:  r.action as string,
      cuando:  String(r.createdAt),
      quien:   quienes.get(r.actorUserId as string)
               ?? (m.viewerName as string)
               ?? (r.actorUserId as string)
               ?? '—',
      rol:     (r.actorRole as string) ?? null,
      sobre:   (paciente ? pacientes.get(idObjetivo) : usuarios.get(idObjetivo)) ?? idObjetivo ?? '—',
      esPaciente: paciente,
      ip:      (r.ipAddress as string | null) ?? null,
    };
  });

  return { eventos, desde, hasta, ok: true };
}
