import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';

/**
 * Escribe una fila en `audit_logs` por REST (Supabase), poniendo el `id` a mano.
 *
 * Por qué el `id` va explícito: en el schema la columna es
 * `id String @id @default(cuid())`, y `cuid()` lo genera **Prisma en el
 * cliente**, no Postgres. El schema se aplicó con `prisma db push` (no hay
 * carpeta `migrations`), así que en la DB la columna quedó `text NOT NULL` y
 * sin default. Los writes que pasan por Prisma —`packages/database/src/audit.ts`,
 * de donde salen las admisiones que leen las funciones de métricas— traen el id
 * ya puesto y andan. Los que van por REST omitían el campo y **morían todos**
 * contra el NOT NULL: no se escribía ni una línea de auditoría desde el panel
 * de usuarios, nómina, freelancers, clínicas ni pagos.
 *
 * El id es un UUID y no un cuid porque no hay generador de cuid del lado del
 * servidor fuera de Prisma, y esta capa (`packages/api`) habla con la DB por
 * REST a propósito. La columna es `text`: conviven sin problema.
 *
 * No lanza nunca. Auditar es un efecto lateral de la mutación: si falla, la
 * mutación ya está hecha y revertirla sería peor. Se anota en los logs con el
 * `action` adelante para poder buscarlo.
 */
export async function insertAuditLog(
  entry: Record<string, unknown> & { action: string },
): Promise<void> {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  });

  if (error) {
    console.error(`[audit] ${entry.action} no se pudo registrar:`, error.message);
  }
}
