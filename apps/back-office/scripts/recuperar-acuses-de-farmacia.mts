/**
 * Rellenar los acuses de farmacia que llegaron ANTES de que existiera el campo.
 *
 * El 2026-10-07 Devin mandó las dos primeras recetas reales (Anita Ostler) y la
 * farmacia confirmó las dos en segundos. Pero las columnas `pharmacyAck*` se
 * crearon después, así que esos dos acuses quedaron solo en el audit log.
 *
 * El webhook ya guarda TODO crudo antes de intentar nada, y gracias a eso se
 * pueden recuperar: la cadena es acuse → `RelatesToMessageID` → el NewRx que
 * salió minutos antes → su NDC → la receta. El mismo camino que usa
 * `marcarAcusePharmacy` de ahora en más; acá se aplica hacia atrás.
 *
 * Correr desde `apps/back-office` con las variables de `.env.local` cargadas:
 *
 *   npx tsx scripts/recuperar-acuses-de-farmacia.mts            # simula
 *   npx tsx scripts/recuperar-acuses-de-farmacia.mts --aplicar  # escribe
 *
 * Solo toca recetas que NO tengan acuse todavía: correrlo dos veces no duplica
 * ni pisa nada.
 */

const { db } = (await import('@precision-medical/database')) as any;
const APLICAR = process.argv.includes('--aplicar');

const webhooks = await db.auditLog.findMany({
  where: { action: 'SCRIPTSURE_WEBHOOK' },
  select: { metadata: true, createdAt: true },
  orderBy: { createdAt: 'asc' },
});

// MessageID -> NDC, leído de cada NewRx que haya pasado por acá.
const ndcPorMensaje = new Map<string, string>();
for (const w of webhooks) {
  const m = (w.metadata as any)?.raw?.Message;
  const id = m?.Header?.MessageID;
  const ndc = m?.Body?.NewRx?.MedicationPrescribed?.Product?.DrugCoded?.NDC;
  if (id && ndc) ndcPorMensaje.set(id, ndc);
}

let encontrados = 0, aplicados = 0, sinCandidata = 0;

for (const w of webhooks) {
  const m = (w.metadata as any)?.raw?.Message;
  const st = m?.Body?.Status;
  if (!st?.Code) continue;
  encontrados++;

  const relatesTo = m?.Header?.RelatesToMessageID ?? null;
  const ndc = relatesTo ? ndcPorMensaje.get(relatesTo) ?? null : null;

  // La hora REAL del acuse es la del mensaje, no la de ahora: es un dato
  // histórico y ponerle la fecha de hoy sería inventar otra vez.
  const cuando = m?.Header?.SentTime ? new Date(m.Header.SentTime) : w.createdAt;

  const rx = ndc
    ? await db.prescription.findFirst({
        where: { ndc, pharmacyAckAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, drugName: true, dawRxId: true },
      })
    : null;

  if (!rx) {
    sinCandidata++;
    console.log(`  ${st.Code} sin candidata (relatesTo ${relatesTo ?? '—'}, ndc ${ndc ?? '—'})`);
    continue;
  }

  console.log(`  ${st.Code} -> ${rx.drugName} (${rx.dawRxId}) @ ${cuando.toISOString()}`);
  if (APLICAR) {
    await db.prescription.update({
      where: { id: rx.id },
      data: { pharmacyAckAt: cuando, pharmacyAckCode: st.Code, pharmacyAckText: st.Description ?? null },
    });
    aplicados++;
  }
}

console.log(`\nacuses en el registro: ${encontrados} · sin candidata: ${sinCandidata}`);
console.log(APLICAR ? `aplicados: ${aplicados}` : '(simulacion: no se escribio nada)');
await db.$disconnect();
