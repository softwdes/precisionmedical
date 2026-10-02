#!/usr/bin/env node
/**
 * Pasar ScriptSure de PRUEBAS al entorno REAL: deja la base consistente con el
 * panel de producción (Practice "Precision Medical", ID 19096).
 *
 *   node scripts/scriptsure-cambio-de-entorno.cjs            ← solo MUESTRA
 *   node scripts/scriptsure-cambio-de-entorno.cjs --aplicar  ← escribe
 *
 * ── Por qué no alcanza con cambiar el host ──────────────────────────────────
 *
 * Tres columnas guardan ids que asignó ScriptSure: `clinics.scriptsurePracticeId`,
 * `providers.scriptsureUserId` y `patients.scriptsurePatientId`. **Esos números no
 * significan lo mismo en los dos entornos.**
 *
 * El peligro no es que fallen: es que NO fallen. La práctica 6907 (la de pruebas)
 * puede existir en el entorno real y ser de otra clínica — entonces la receta sale,
 * con datos de un paciente nuestro, al lugar equivocado. Un id inexistente da error
 * y se arregla; uno que existe y es de otro es una fuga.
 *
 * ── Qué hace, medido contra el panel el 2026-09-30 ──────────────────────────
 *
 *  · CLINICAS  → practice 19096 en todas. Es UNA sola práctica para la empresa,
 *                así que Telemedicine (que estaba vacía) también entra.
 *  · DEVIN     → se le VACÍA el id. En el panel real figura como *Supporting
 *                Administrator*, no como Provider: no es prescriptor. Cargarle su
 *                68152 sería peor que dejarlo vacío — pasaría el control de
 *                "¿está dado de alta?" y recién fallaría contra ScriptSure, con un
 *                error crudo. Vacío, la pantalla dice "todavía no estás habilitado
 *                como prescriptor", que es exactamente la verdad.
 *  · CRISTIAN  → se vacía: es cuenta de prueba y no existe en el panel real.
 *  · PACIENTES → se vacían los 3 ids; se vuelven a crear solos allá.
 *  · SESIONES  → se borran: el token es del entorno viejo.
 *  · NO SE TOCAN Barry (68895), Justin (68302), David (68602) y Andrew (68299):
 *    esos ids YA son del entorno real. Es la razón por la que fallaban contra
 *    staging — nunca estuvieron ahí.
 *
 * ── Quién queda sin recetar, y es decisión tomada ───────────────────────────
 *
 * Erick, 2026-09-30: *"solo vamos a activar los que están en pantalla"*. Nathaniel
 * Gay, Cassie Broadhead, Scott Rigdon y Mark Stouffer no están en el panel, así
 * que no prescriben. No rompe nada: las rutas contestan `NOT_ONBOARDED` y la
 * pantalla lo explica.
 *
 * ── Orden ───────────────────────────────────────────────────────────────────
 *
 *   1. correr esto con --aplicar
 *   2. cargar SCRIPTSURE_API_KEY y SCRIPTSURE_SECRET de producción
 *   3. recién ahí SCRIPTSURE_ENV=production
 */
const fs = require('node:fs');
const path = require('node:path');
const pkgRoot = path.resolve(__dirname, '..', 'packages', 'database');
const { Client } = require(path.join(pkgRoot, 'node_modules', 'pg'));

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const p of [path.join(pkgRoot, '.env'), path.resolve(__dirname, '..', 'apps', 'back-office', '.env.local')]) {
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^DATABASE_URL=(.*)$/m);
    if (m) return m[1].trim().replace(/^"|"$/g, '');
  }
  throw new Error('DATABASE_URL no está ni en el entorno ni en los .env');
}

/** Practice real, leída del panel. Una sola para toda la empresa. */
const PRACTICE_REAL = '19096';

/** Correos cuyos ids YA son del entorno real: no se tocan. */
const YA_CORRECTOS = [
  'barryclanton@precisionmedicalcare.com',
  'justin@precisionmedicalcare.com',
  'david@precisionmedicalcare.com',
  'andrew@precisionmedicalcare.com',
];

const APLICAR = process.argv.includes('--aplicar');

(async () => {
  const c = new Client({ connectionString: databaseUrl() });
  await c.connect();

  console.log(APLICAR ? '*** MODO APLICAR — esto ESCRIBE ***' : 'Modo solo lectura. Nada se toca.');
  console.log('');

  // ── Foto previa, que es la única copia de los ids viejos ─────────────────
  const cl = await c.query(`select name, "scriptsurePracticeId" as pid from clinics order by name`);
  console.log('CLINICAS  (practice real = ' + PRACTICE_REAL + ')');
  for (const r of cl.rows) {
    const estado = String(r.pid ?? '') === PRACTICE_REAL ? 'ya ok' : 'cambia: ' + (r.pid ?? 'vacía') + ' -> ' + PRACTICE_REAL;
    console.log('   ' + (r.name || '').padEnd(22) + estado);
  }

  const pr = await c.query(`
    select "firstName" || ' ' || "lastName" as nombre, lower(email) as email, "scriptsureUserId" as uid
    from providers where "scriptsureUserId" is not null order by "scriptsureUserId"`);
  console.log('');
  console.log('PROVIDERS con id cargado');
  for (const r of pr.rows) {
    const queda = YA_CORRECTOS.includes(r.email);
    console.log('   ' + String(r.uid).padEnd(8) + (r.nombre || '').padEnd(28) +
      (queda ? 'SE QUEDA (ya es del entorno real)' : 'se VACÍA (es de pruebas o no prescribe)'));
  }

  const pa = await c.query(`select count(*)::int as n from patients where "scriptsurePatientId" is not null`);
  const se = await c.query(`select count(*)::int as n from scriptsure_sessions`);
  console.log('');
  console.log('PACIENTES con id de staging: ' + pa.rows[0].n + '  → se vacían');
  console.log('SESIONES guardadas: ' + se.rows[0].n + '  → se borran (token del entorno viejo)');

  if (!APLICAR) {
    console.log('');
    console.log('──────────────────────────────────────────────────────────');
    console.log('ANOTÁ lo de arriba: es la única copia de los ids viejos.');
    console.log('Después:  node scripts/scriptsure-cambio-de-entorno.cjs --aplicar');
    await c.end();
    return;
  }

  // ── Aplicar ──────────────────────────────────────────────────────────────
  const a = await c.query(
    `update clinics set "scriptsurePracticeId" = $1 where "scriptsurePracticeId" is distinct from $1`,
    [PRACTICE_REAL],
  );
  const b = await c.query(
    `update providers set "scriptsureUserId" = null
      where "scriptsureUserId" is not null and lower(email) <> all($1::text[])`,
    [YA_CORRECTOS],
  );
  const d = await c.query(`update patients set "scriptsurePatientId" = null where "scriptsurePatientId" is not null`);
  const e = await c.query(`delete from scriptsure_sessions`);

  console.log('');
  console.log('LISTO:');
  console.log('   clinicas actualizadas  ' + a.rowCount);
  console.log('   providers vaciados     ' + b.rowCount);
  console.log('   pacientes vaciados     ' + d.rowCount);
  console.log('   sesiones borradas      ' + e.rowCount);
  console.log('');
  console.log('Ahora: credenciales de producción, y recién después SCRIPTSURE_ENV=production.');

  await c.end();
})();
