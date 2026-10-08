/**
 * Destrabar `prisma db push` — los dos índices únicos de appointment_billing.
 *
 * El porqué completo está en
 * `packages/database/prisma/sql/20261008b-indices-de-facturacion-al-schema.sql`.
 * En corto: el schema pide dos índices únicos COMPLETOS y la base los tiene con
 * el mismo nombre pero PARCIALES, así que Prisma aborta al crearlos. En Postgres
 * los dos hacen lo mismo —un UNIQUE ya ignora los NULL—, así que convertirlos no
 * cambia ningún comportamiento.
 *
 * Correr desde `apps/back-office`:
 *
 *   npx tsx scripts/destrabar-db-push.mts            # mide y NO escribe
 *   npx tsx scripts/destrabar-db-push.mts --aplicar  # escribe
 *
 * Idempotente: correrlo de nuevo no hace nada.
 *
 * ── Por qué un script y no el SQL pegado en la consola ──────────────────────
 *
 * Porque usa la MISMA conexión que la app. Ya pasó dos veces que un SQL del
 * panel de Admin terminó en la base clínica y las dos veces dijo "Success": el
 * proyecto que se llama "phoenix-dev" ES producción. Acá no hay que elegir base.
 *
 * Igual verifica antes de tocar nada, y aborta si algo no es lo que se midió.
 */

const { db } = (await import('@precision-medical/database')) as any;
const APLICAR = process.argv.includes('--aplicar');

const OBJETIVO = [
  { indice: 'appointment_billing_braceId_key', columna: 'braceId' },
  { indice: 'appointment_billing_cashServiceId_key', columna: 'cashServiceId' },
] as const;

/** El índice que NO se toca y que tiene que seguir ahí cuando esto termine. */
const INTOCABLE = 'appointment_billing_cpt_unique';

let salida = 0;

try {
  console.log('── 1. ¿Es la base que esperamos? ──');
  const [{ tabla }] = await db.$queryRawUnsafe(`
    SELECT count(*)::int AS tabla FROM information_schema.tables
     WHERE table_name = 'appointment_billing'
  `);
  if (!tabla) {
    console.error('  ✘ No existe appointment_billing. Base equivocada — no se toca nada.');
    process.exit(1);
  }
  const [{ filas }] = await db.$queryRawUnsafe('SELECT count(*)::int AS filas FROM appointment_billing');
  console.log(`  ✔ appointment_billing existe, ${filas.toLocaleString()} filas`);

  console.log('\n── 2. Estado de los índices ──');
  const idx = await db.$queryRawUnsafe(`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'appointment_billing'
  `);
  const porNombre = new Map<string, string>(idx.map((i: any) => [i.indexname, i.indexdef]));

  if (!porNombre.has(INTOCABLE)) {
    console.error(`  ✘ Falta ${INTOCABLE}, que es el candado de los CPT duplicados.`);
    console.error('    Algo lo borró. Eso se revisa ANTES de seguir — no se toca nada acá.');
    process.exit(1);
  }
  console.log(`  ✔ ${INTOCABLE} está presente (no se toca)`);

  const pendientes: typeof OBJETIVO[number][] = [];
  for (const o of OBJETIVO) {
    const def = porNombre.get(o.indice);
    if (!def) { console.log(`  · ${o.indice}: no existe — lo crea db push solo`); continue; }
    const parcial = def.includes('WHERE');
    console.log(`  ${parcial ? '⚠' : '✔'} ${o.indice}: ${parcial ? 'PARCIAL (hay que convertirlo)' : 'ya está completo'}`);
    if (parcial) pendientes.push(o);
  }

  if (pendientes.length === 0) {
    console.log('\nNada que hacer: los dos ya están como los quiere el schema.');
    process.exit(0);
  }

  console.log('\n── 3. ¿El índice nuevo rechazaría alguna fila? ──');
  let hayChoque = false;
  for (const o of pendientes) {
    const [{ con_valor, distintos }] = await db.$queryRawUnsafe(`
      SELECT count(*) FILTER (WHERE "${o.columna}" IS NOT NULL)::int AS con_valor,
             count(DISTINCT "${o.columna}")::int                     AS distintos
        FROM appointment_billing
    `);
    const ok = con_valor === distintos;
    if (!ok) hayChoque = true;
    console.log(`  ${ok ? '✔' : '✘'} ${o.columna}: ${con_valor} con valor, ${distintos} distintos` +
      (ok ? '' : ` → ${con_valor - distintos} DUPLICADOS, el único no entraría`));
  }
  if (hayChoque) {
    console.error('\n  Hay duplicados reales. Eso es una decisión humana, no la resuelve este script.');
    process.exit(1);
  }

  if (!APLICAR) {
    console.log('\n(simulación: no se escribió nada)');
    console.log('Para aplicarlo:  npx tsx scripts/destrabar-db-push.mts --aplicar');
    process.exit(0);
  }

  console.log('\n── 4. Aplicando ──');
  // Todo junto: `DROP INDEX` toma candado exclusivo sobre la tabla, así que no
  // hay un instante sin el único en el que alguien pueda colar un duplicado.
  await db.$transaction(
    pendientes.flatMap((o) => [
      db.$executeRawUnsafe(`DROP INDEX IF EXISTS "${o.indice}"`),
      db.$executeRawUnsafe(`CREATE UNIQUE INDEX "${o.indice}" ON "appointment_billing" ("${o.columna}")`),
    ]),
  );
  for (const o of pendientes) console.log(`  ✔ ${o.indice} convertido a único completo`);

  console.log('\n── 5. Control después de tocar ──');
  const despues = await db.$queryRawUnsafe(`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'appointment_billing'
  `);
  const mapa = new Map<string, string>(despues.map((i: any) => [i.indexname, i.indexdef]));
  for (const o of OBJETIVO) {
    const def = mapa.get(o.indice);
    console.log(`  ${def && !def.includes('WHERE') ? '✔' : '✘'} ${o.indice}: ${def ? (def.includes('WHERE') ? 'sigue parcial' : 'completo') : 'DESAPARECIÓ'}`);
  }
  console.log(`  ${mapa.has(INTOCABLE) ? '✔' : '✘'} ${INTOCABLE}: ${mapa.has(INTOCABLE) ? 'intacto' : 'DESAPARECIÓ — avisar'}`);
  const [{ despuesFilas }] = await db.$queryRawUnsafe('SELECT count(*)::int AS "despuesFilas" FROM appointment_billing');
  console.log(`  ${despuesFilas === filas ? '✔' : '✘'} filas: ${despuesFilas.toLocaleString()} (antes ${filas.toLocaleString()})`);

  console.log('\nListo. Ahora `db:push` deja de chocar.');
} catch (e) {
  console.error('\n✘ Falló:', e instanceof Error ? e.message : e);
  salida = 1;
} finally {
  await db.$disconnect();
}

process.exit(salida);
