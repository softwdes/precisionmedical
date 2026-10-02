#!/usr/bin/env node
/**
 * Devin recupera su identidad de ScriptSure en el entorno real.
 *
 *   node scripts/scriptsure-devin-id-real.cjs            ← solo MUESTRA
 *   node scripts/scriptsure-devin-id-real.cjs --aplicar  ← escribe
 *
 * ── Qué pasó ────────────────────────────────────────────────────────────────
 *
 * El 30-sep, al cortar de pruebas a producción, le vacié el id a Devin: en el
 * panel real figura como *Supporting Administrator* y no como Provider, y supuse
 * que ScriptSure lo rechazaría como prescriptor.
 *
 * **La suposición era falsa y está medida:** `Set Practice & Prescriber` con
 * practice 19096 y prescriber 68152 devuelve **200**. ScriptSure lo acepta.
 *
 * El costo del error fue concreto: su pantalla de Recetas quedó en "You're not
 * enabled as a prescriber in ScriptSure yet". Antes la veía.
 *
 * ── Por qué 68152 es el valor correcto ──────────────────────────────────────
 *
 * Es su id REAL en el entorno real, leído del panel (Vendor 154 → Organization
 * 9945 → Practice 19096). El 10845 que tenía antes era del entorno de pruebas y
 * allá no existe — el servidor lo rechaza con "cannot be found".
 *
 * ── Lo que esto NO decide ───────────────────────────────────────────────────
 *
 * Si puede FIRMAR una receta lo decide ScriptSure, no nosotros. En el panel no
 * tiene NPI ni DEA ni los sellos de IDP/EPCS que sí tienen los cuatro Provider
 * Physician, así que es probable que un envío real se lo frene ALLÁ — que es
 * donde corresponde que se frene. Nuestro trabajo es pasar su identidad
 * verdadera, no adivinar su permiso.
 */
const fs = require('node:fs');
const path = require('node:path');
const pkgRoot = path.resolve(__dirname, '..', 'packages', 'database');
const { Client } = require(path.join(pkgRoot, 'node_modules', 'pg'));

const CORREO = 'devin@precisionmedicalcare.com';
const ID_REAL = '68152';
const APLICAR = process.argv.includes('--aplicar');

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const p of [path.join(pkgRoot, '.env'), path.resolve(__dirname, '..', 'apps', 'back-office', '.env.local')]) {
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^DATABASE_URL=(.*)$/m);
    if (m) return m[1].trim().replace(/^"|"$/g, '');
  }
  throw new Error('DATABASE_URL no está');
}

(async () => {
  const c = new Client({ connectionString: databaseUrl() });
  await c.connect();

  const antes = await c.query(
    `select "firstName" || ' ' || "lastName" as nombre, "scriptsureUserId" as uid
       from providers where lower(email) = $1`, [CORREO]);
  console.log('ANTES:  ' + JSON.stringify(antes.rows[0] ?? null));

  if (!APLICAR) {
    console.log('');
    console.log('Modo solo lectura. Para aplicar:');
    console.log('   node scripts/scriptsure-devin-id-real.cjs --aplicar');
    await c.end();
    return;
  }

  const r = await c.query(
    `update providers set "scriptsureUserId" = $1 where lower(email) = $2`, [ID_REAL, CORREO]);

  const despues = await c.query(
    `select "firstName" || ' ' || "lastName" as nombre, "scriptsureUserId" as uid
       from providers where lower(email) = $1`, [CORREO]);
  console.log('DESPUES: ' + JSON.stringify(despues.rows[0] ?? null) + '   (filas: ' + r.rowCount + ')');

  await c.end();
})();
