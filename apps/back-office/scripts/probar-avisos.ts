/**
 * Muestra el texto REAL de cada aviso al celular, en los dos idiomas.
 *
 *   pnpm --filter @precision-medical/back-office exec tsx scripts/probar-avisos.ts
 *
 * Usa el catálogo de verdad (`@/i18n/messages`) y el mismo `createTranslator`
 * que usa `lib/push.ts`. No reescribe las frases: un test que copia la frase
 * pasa aunque la real esté rota.
 *
 * Existe porque un aviso no se puede "abrir para mirarlo": llega al teléfono de
 * otra persona, a las 7:30, y no hay pantalla donde verlo antes. Esto es lo más
 * cerca que se puede estar de leerlo sin mandarlo.
 */
import { createTranslator } from 'next-intl';
import { messages } from '../i18n/messages';

const CASOS: Array<[string, string, Record<string, string | number>]> = [
  ['mensaje nuevo',            'msgNuevo',        {}],
  ['mensaje urgente',          'msgUrgente',      {}],
  ['de quién',                 'msgDe',           { remitente: 'Beatriz' }],
  ['sin remitente',            'msgSinLeer',      {}],
  ['provider · 1 paciente',    'diaPacientes',    { count: 1 }],
  ['provider · 7 pacientes',   'diaPacientes',    { count: 7 }],
  ['provider · primera hora',  'diaPrimeroA',     { hora: '8:30 AM' }],
  ['clínica · 1 cita',         'diaCitas',        { count: 1 }],
  ['clínica · 12 citas',       'diaCitas',        { count: 12 }],
  ['clínica · 1 sin firmar',   'diaSinFirmar',    { count: 1 }],
  ['clínica · 4 sin firmar',   'diaSinFirmar',    { count: 4 }],
  ['clínica · todas firmadas', 'diaTodasFirmadas', {}],
  ['abogado · 1 caso',         'casosAtencion',   { count: 1 }],
  ['abogado · 5 casos',        'casosAtencion',   { count: 5 }],
  ['abogado · 1 día',          'casoMasAtrasado', { count: 1 }],
  ['abogado · 9 días',         'casoMasAtrasado', { count: 9 }],
];

let fallos = 0;

for (const locale of ['es', 'en'] as const) {
  console.log(`\n═══ ${locale.toUpperCase()} ═══`);
  const t = createTranslator({ locale, messages: messages[locale], namespace: 'phoenix.push' });
  for (const [caso, clave, valores] of CASOS) {
    let salida: string;
    try {
      salida = t(clave as never, valores as never);
    } catch (e) {
      console.log(`  ✗ ${caso.padEnd(26)} ${(e as Error).message}`);
      fallos++;
      continue;
    }
    // Un placeholder sin resolver sale como `{algo}` y en el teléfono se lee así.
    if (/\{[a-zA-Z]/.test(salida)) {
      console.log(`  ✗ ${caso.padEnd(26)} placeholder sin resolver -> ${salida}`);
      fallos++;
      continue;
    }
    // Si next-intl no encuentra la clave devuelve la RUTA, no el texto.
    if (salida.includes('phoenix.push')) {
      console.log(`  ✗ ${caso.padEnd(26)} clave inexistente -> ${salida}`);
      fallos++;
      continue;
    }
    console.log(`    ${caso.padEnd(26)} ${salida}`);
  }
}

// Y la hora, que era el otro error: estaba clavada en 'es-US'.
console.log('\n═══ la hora del parte ═══');
const cuando = new Date('2026-09-24T14:30:00Z');
for (const locale of ['es', 'en'] as const) {
  const hora = new Intl.DateTimeFormat(`${locale}-US`, {
    timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(cuando);
  console.log(`    ${locale}  ${hora}`);
}

console.log(fallos ? `\n✗ ${fallos} fallos` : '\n✓ las 16 frases salen bien en los dos idiomas');
process.exit(fallos ? 1 : 0);
