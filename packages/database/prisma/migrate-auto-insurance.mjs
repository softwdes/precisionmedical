/**
 * Migra `cases.consentsData.insurances[]` → tabla `case_auto_insurances`.
 *
 * Paso 2 de la vista de tracking de Edson (docs/plan-vista-edson.md §3.1).
 *
 *   node prisma/migrate-auto-insurance.mjs --dry     ← reporta sin escribir
 *   node prisma/migrate-auto-insurance.mjs           ← escribe
 *
 * Idempotente: salta los casos que ya tienen fila. El JSON NO se borra — queda
 * como respaldo hasta que el modal de recepción apunte a la tabla (paso 3).
 *
 * Decisiones que vale la pena conocer:
 *
 *  · `pipAvailable` era texto libre y llegó con basura ("343", "kl", "N/A", "SI").
 *    Se normaliza a YES / NO / UNKNOWN; lo que no se entiende cae a UNKNOWN,
 *    que es lo honesto: significa "nadie preguntó todavía".
 *
 *  · La aseguradora se linkea al catálogo SOLO si el nombre matchea exacto
 *    (normalizando espacios y mayúsculas). Si no, va a `carrierNameRaw` y la
 *    grilla cae a `Case.primaryInsurance`. No se inventan carriers.
 *
 *  · Los adjusters NO siembran el catálogo. La data existente son pruebas
 *    ("pablo", "jkjkjkkj", "none") y sembrarlas ensuciaría el catálogo desde el
 *    día uno. Se conservan en `adjusterNameRaw` / `adjusterPhoneRaw`.
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const DRY = process.argv.includes('--dry');

/** "  GEICO  " y "geico" son el mismo carrier. */
const norm = (s) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Texto libre → enum. Todo lo que no se reconoce es UNKNOWN, no NO. */
function normalizePip(raw) {
  const v = norm(raw);
  if (['y', 'yes', 'si', 'sí', 's', 'true', '1'].includes(v)) return 'YES';
  if (['n', 'no', 'false', '0'].includes(v)) return 'NO';
  return 'UNKNOWN';
}

/** Fecha en texto → Date, o null si no es una fecha válida. */
function parseDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

const clean = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

async function main() {
  console.log(DRY ? '── DRY RUN (no escribe nada) ──\n' : '── Migrando ──\n');

  const carriers = await db.insuranceCarrier.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const carrierByName = new Map(carriers.map((c) => [norm(c.name), c.id]));
  console.log(`catálogo de aseguradoras: ${carriers.length}`);

  const cases = await db.case.findMany({
    where: { deletedAt: null, consentsData: { not: null } },
    select: { id: true, caseCode: true, consentsData: true },
  });
  console.log(`casos con consentsData: ${cases.length}\n`);

  const existing = new Set(
    (await db.caseAutoInsurance.findMany({ select: { caseId: true } })).map((r) => r.caseId),
  );

  const stats = {
    sinAuto: 0, yaExistia: 0, creados: 0,
    carrierLinkeado: 0, carrierRaw: 0,
    adjusterRaw: 0, pip: { YES: 0, NO: 0, UNKNOWN: 0 },
  };
  const pipDescartado = [];

  for (const c of cases) {
    const arr = Array.isArray(c.consentsData?.insurances) ? c.consentsData.insurances : [];
    const auto = arr.find((i) => i?.insType === 'AUTO');
    if (!auto) { stats.sinAuto++; continue; }
    if (existing.has(c.id)) { stats.yaExistia++; continue; }

    const carrierRaw = clean(auto.carrier);
    const carrierId  = carrierRaw ? carrierByName.get(norm(carrierRaw)) ?? null : null;
    if (carrierId) stats.carrierLinkeado++;
    else if (carrierRaw) stats.carrierRaw++;

    const pip = normalizePip(auto.pipAvailable);
    stats.pip[pip]++;
    if (pip === 'UNKNOWN' && clean(auto.pipAvailable)) {
      pipDescartado.push(`${c.caseCode}: "${auto.pipAvailable}"`);
    }

    const adjusterNameRaw = clean(auto.adjusterName);
    if (adjusterNameRaw) stats.adjusterRaw++;

    const data = {
      caseId: c.id,
      // Solo se guarda el carrier si NO matcheó el catálogo; si matcheó, se linkea.
      carrierId,
      carrierNameRaw: carrierId ? null : carrierRaw,
      policyId: clean(auto.policyId),
      lossDate: parseDate(auto.lossDate),
      pipAvailable: pip,
      claimNum: clean(auto.claimNum),
      adjusterNameRaw,
      adjusterPhoneRaw: clean(auto.adjusterPhone),
      comments: clean(auto.comments),
      fullLien: auto.fullLien === true,
      lienComments: clean(auto.lienComments),
    };

    if (!DRY) await db.caseAutoInsurance.create({ data });
    stats.creados++;
  }

  console.log('sin entrada AUTO:      ', stats.sinAuto);
  console.log('ya tenían fila:        ', stats.yaExistia);
  console.log(DRY ? 'se crearían:           ' : 'creados:               ', stats.creados);
  console.log('carrier linkeado:      ', stats.carrierLinkeado);
  console.log('carrier en texto libre:', stats.carrierRaw);
  console.log('adjuster en texto libre:', stats.adjusterRaw, '(NO se sembró el catálogo — es data de prueba)');
  console.log('PIP →', JSON.stringify(stats.pip));

  if (pipDescartado.length) {
    console.log(`\nvalores de PIP que no se entendieron y quedaron en UNKNOWN (${pipDescartado.length}):`);
    console.log(pipDescartado.map((l) => `  ${l}`).join('\n'));
  }

  console.log(DRY ? '\nDRY RUN — no se escribió nada.' : '\nListo.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
