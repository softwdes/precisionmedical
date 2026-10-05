/**
 * Paso 2 del pedido de Devin (2026-10-04): *"All of Nate's templates can just be
 * moved to his individual list"*.
 *
 * Pasa las 4 plantillas `NG-` (Nathaniel Gay) a `scope PERSONAL` y les cambia el
 * dueño a Nate. Hoy son SHARED y figuran a nombre de Erick.
 *
 * NO sirve de nada sin el paso 1 (`lib/alcance-listas.ts`): hasta el 2026-10-04
 * ninguna de las 3 consultas que leen plantillas miraba `scope`, así que marcar
 * PERSONAL no escondía nada.
 *
 * Medido antes de escribir: las 4 tienen `usageCount` 0 y cero favoritos. Una
 * sola nota las usó —un BORRADOR de Devin con `NG-MVA F/U`— y no se rompe: la
 * nota guarda su propio texto en sus columnas SOAP y `templateId` es solo una
 * referencia.
 *
 * Correr desde `apps/back-office` con las variables de `.env.local` cargadas:
 *
 *   npx tsx scripts/plantillas-nate-a-personal.mts <respaldo.json>            # simula
 *   npx tsx scripts/plantillas-nate-a-personal.mts <respaldo.json> --aplicar  # escribe
 *
 * Sin `--aplicar` no toca nada y deja el estado previo en <respaldo.json>, que
 * es el material para revertir. Aborta si no encuentra exactamente 4 filas.
 * Cada fila queda en el audit log como UPDATE_TEMPLATE con before/after.
 */
const { db, writeAuditLog } = (await import('@precision-medical/database')) as any;
const fs = await import('node:fs');

const NATE  = 'cxsmtnw5djstmilkar0bnwg';   // Nathaniel Gay (users.id)
const ERICK = 'cqhr4cvbc2vx1xtyzofuqw';    // quien autoriza
const RESPALDO = process.argv[2];
const APLICAR  = process.argv.includes('--aplicar');

const antes = await db.template.findMany({
  where: { deletedAt: null, title: { startsWith: 'NG-' } },
  select: { id: true, title: true, scope: true, createdById: true },
  orderBy: { title: 'asc' },
});

console.log(`ANTES (${antes.length}):`);
for (const t of antes) console.log(`  ${t.title.padEnd(22)} ${t.scope.padEnd(9)} dueno=${t.createdById}`);

if (antes.length !== 4) { console.log('\nABORTA: esperaba 4 filas NG-, hay ' + antes.length); await db.$disconnect(); process.exit(1); }

fs.writeFileSync(RESPALDO, JSON.stringify(antes, null, 2), 'utf8');
console.log(`\nrespaldo -> ${RESPALDO}`);

if (!APLICAR) { console.log('\n(simulacion: no se escribio nada)'); await db.$disconnect(); process.exit(0); }

for (const t of antes) {
  const after = await db.template.update({
    where: { id: t.id },
    data: { scope: 'PERSONAL', createdById: NATE },
    select: { id: true, title: true, scope: true, createdById: true },
  });
  await writeAuditLog(db, {
    actorType: 'AI_AGENT',
    actorUserId: ERICK,
    actorRole: 'SUPER_ADMIN',
    action: 'UPDATE_TEMPLATE',
    entityType: 'templates',
    entityId: t.id,
    before: t,
    after,
    metadata: { motivo: "pedido de Devin: mover las plantillas de Nate a su lista individual", pasoPlan: 2 },
  });
  console.log(`  OK ${after.title} -> ${after.scope} dueno=${after.createdById}`);
}

const despues = await db.template.findMany({
  where: { deletedAt: null, title: { startsWith: 'NG-' } },
  select: { title: true, scope: true, createdById: true }, orderBy: { title: 'asc' },
});
console.log('\nDESPUES:');
for (const t of despues) console.log(`  ${t.title.padEnd(22)} ${t.scope.padEnd(9)} dueno=${t.createdById}`);
await db.$disconnect();
