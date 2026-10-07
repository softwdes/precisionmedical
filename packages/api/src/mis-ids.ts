import { supabaseAdmin } from './supabase-admin';

/**
 * Los ids que cuentan como "yo".
 *
 * ── Por qué una persona puede tener dos ────────────────────────────────────
 *
 * `ctx.user.id` es el id de AUTH. Quien escribe avisos usa el de la tabla
 * `users`, y en este directorio no siempre son el mismo. Medido el 2026-10-07
 * sobre las 30 cuentas: 29 coinciden y UNA no —la del SUPER_ADMIN, auth
 * `9ec79c8f` contra users `93fb65d1`—, así que sus avisos de seguridad se
 * escribían contra un id que su campana nunca consultaba. El dueño era el
 * único a quien no le llegaba nada.
 *
 * Arreglar el id sería tocar una clave primaria que media base referencia. El
 * costo no se parece al problema; esto deja de suponer que son iguales y
 * cuesta una consulta.
 *
 * ── Por qué vive acá y no dentro de un router ──────────────────────────────
 *
 * Porque lo necesitan la campana y el contador de incidencias, y dos copias de
 * esta regla es exactamente cómo una se arregla y la otra no.
 *
 * `ilike` y no `eq`: Supabase Auth normaliza el correo a minúsculas y el
 * directorio no siempre. Esa diferencia ya dejó gente sin permisos antes, y
 * `trpc.ts` la resuelve igual.
 *
 * Si la consulta falla se devuelve solo el id de auth: mostrar de menos es
 * malo, pero mostrarle a alguien lo de otro sería peor.
 */
export async function misIds(
  ctx: { user: { id: string; email?: string | null } },
): Promise<string[]> {
  const ids = new Set([ctx.user.id]);
  const correo = ctx.user.email;

  if (correo !== undefined && correo !== null && correo !== '') {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id')
      .ilike('email', correo)
      .limit(1);

    const fila = (data?.[0] as { id?: string } | undefined)?.id;
    if (fila !== undefined) ids.add(fila);
  }

  return [...ids];
}
