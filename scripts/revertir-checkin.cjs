#!/usr/bin/env node
/**
 * Deshacer UN check-in marcado por error en una cita.
 *
 *   node scripts/revertir-checkin.cjs --caso MVA-1234             → simulación: solo LEE
 *   node scripts/revertir-checkin.cjs --caso MVA-1234 --aplicar   → escribe, en una transacción
 *
 * Existe porque "Check in" no tiene botón de deshacer en ninguna pantalla: un
 * clic de más (por ejemplo, sobre una cita de OTRA semana) dejaba al paciente
 * como llegado y la única salida era la base. Desde ahora el check-in pide
 * confirmación, pero lo que ya quedó marcado se corrige con esto.
 *
 * El check-in escribe solo `status` y `checkedInAt` (+ una fila de auditoría),
 * así que deshacerlo es devolver esos dos campos. No se borra nada.
 *
 * Protecciones:
 *   · el caso tiene que tener EXACTAMENTE UNA cita en CHECKED_IN — con cero o con
 *     varias se detiene y no adivina cuál;
 *   · esa cita tiene que seguir como la dejó el clic: sin sala (`admittedAt`), sin
 *     doctor (`doctorDoneAt`), sin checkout;
 *   · se niega si ya tiene cargos, nota de visita o triaje: eso ya es trabajo
 *     clínico y se resuelve a mano;
 *   · todo en una transacción, y deja una fila `REVERT_CHECK_IN` en el audit log
 *     con el antes y el después.
 *
 * Vuelve a SCHEDULED. Si la cita estaba CONFIRMED o PENDING antes del clic, el
 * audit log de la cita (`CREATE_APPOINTMENT`) dice cuál era; este script no lo
 * adivina.
 */
const fs = require('node:fs'), path = require('node:path');
const pkg = path.resolve(__dirname, '..', 'packages', 'database');
const { Client } = require(path.join(pkg, 'node_modules', 'pg'));

const args = process.argv.slice(2);
const iCaso = args.indexOf('--caso');
const CASO = iCaso >= 0 ? String(args[iCaso + 1] ?? '').trim().toUpperCase() : '';
const APLICAR = args.includes('--aplicar');
if (!/^[A-Z]{2,5}-\d{1,8}$/.test(CASO)) {
  console.error('Uso: node scripts/revertir-checkin.cjs --caso MVA-1234 [--aplicar]');
  process.exit(2);
}

let url = process.env.DATABASE_URL;
if (!url) for (const p of [path.join(pkg, '.env'), path.resolve(__dirname, '..', 'apps', 'back-office', '.env.local')]) {
  if (!fs.existsSync(p)) continue; const m = fs.readFileSync(p, 'utf8').match(/^DATABASE_URL=(.*)$/m); if (m) { url = m[1].trim().replace(/^"|"$/g, ''); break; }
}
if (!url) throw new Error('DATABASE_URL no está ni en el entorno ni en los .env');

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('begin');
  try {
    const citas = (await c.query(
      `select a.id, a.status::text, a."checkedInAt", a."admittedAt", a."doctorDoneAt", a."checkedOutAt", a."scheduledFor"
         from appointments a join cases cs on cs.id = a."caseId"
        where cs."caseCode" = $1 and a."deletedAt" is null and a.status::text = 'CHECKED_IN'
        for update of a`, [CASO])).rows;
    console.log(`Caso ${CASO}: ${citas.length} cita(s) en CHECKED_IN`);
    if (citas.length !== 1) throw new Error(citas.length === 0 ? 'no hay ninguna cita en CHECKED_IN para ese caso' : 'hay más de una cita en CHECKED_IN: no adivino cuál; revisa a mano');
    const a = citas[0];
    console.log('Cita:', JSON.stringify(a));
    if (a.admittedAt || a.doctorDoneAt || a.checkedOutAt) throw new Error('la cita ya pasó a sala, doctor o checkout: no se toca');
    const t = (await c.query(
      `select (select count(*) from appointment_billing where "appointmentId"=$1) cargos,
              (select count(*) from visit_notes where "appointmentId"=$1) notas,
              (select count(*) from triage_records where "appointmentId"=$1) triaje`, [a.id])).rows[0];
    console.log('Trabajo asociado:', JSON.stringify(t));
    if (Number(t.cargos) || Number(t.notas) || Number(t.triaje)) throw new Error('ya tiene cargos, nota o triaje: no se revierte sola');

    console.log(`\nVoy a dejarla: status CHECKED_IN → SCHEDULED, checkedInAt ${a.checkedInAt ? a.checkedInAt.toISOString() : '—'} → null`);
    if (!APLICAR) { console.log('SIMULACIÓN: no se escribió nada. Para aplicar: agrega --aplicar'); await c.query('rollback'); return; }

    const r = await c.query(`update appointments set status='SCHEDULED', "checkedInAt"=null, "updatedAt"=now() where id=$1 and status::text='CHECKED_IN'`, [a.id]);
    if (r.rowCount !== 1) throw new Error('filas afectadas: ' + r.rowCount);
    await c.query(
      `insert into audit_logs (id, "actorType", action, "entityType", "entityId", before, after, metadata, "createdAt")
       values ($1, 'SYSTEM', 'REVERT_CHECK_IN', 'appointment', $2, $3::jsonb, $4::jsonb, $5::jsonb, now())`,
      ['rv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), a.id,
       JSON.stringify({ status: 'CHECKED_IN', checkedInAt: a.checkedInAt }),
       JSON.stringify({ status: 'SCHEDULED', checkedInAt: null }),
       JSON.stringify({ motivo: 'Check-in marcado por error; se deshace con scripts/revertir-checkin.cjs', caseCode: CASO })]);
    await c.query('commit');
    console.log('REVERTIDA.');
  } catch (e) {
    await c.query('rollback').catch(() => {});
    console.log('SIN CAMBIOS:', e.message); process.exitCode = 1;
  } finally { await c.end(); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
