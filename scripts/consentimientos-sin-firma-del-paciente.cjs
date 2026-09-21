#!/usr/bin/env node
/**
 * ¿Cuántos casos muestran una firma en el PDF y el sistema igual dice que
 * faltan los consentimientos?
 *
 *   node scripts/consentimientos-sin-firma-del-paciente.cjs
 *
 * Sólo LEE y no escribe nada.
 *
 * ── La pregunta ─────────────────────────────────────────────────────────────
 *
 * Erick, 21-sep-2026, con dos fotos: la ficha marca "Missing consents · 57%" y
 * el PDF del intake muestra una firma. Parece un bug y no lo es — el propio PDF
 * dice **"Digital Sign (Staff — patient signature not on file)"** y la casilla
 * de aceptación está VACÍA.
 *
 * Hay DOS firmas y sólo una vale:
 *
 *   · `consentsData->>'financialSignatureSvg'` — la del PACIENTE (portal o
 *     tablet, paso 9 del formulario). Es la que cuenta legalmente y la única
 *     que mira `consentimientosFirmados()` en `lib/intake-progreso.ts`.
 *   · `cases."consentSignaturePng"` — campo viejo, lo llenaba el back-office
 *     cuando el PERSONAL firmaba en lugar del paciente al crear el caso. El PDF
 *     lo usa como respaldo, y por eso se ve una firma que no es del paciente.
 *
 * Lo que este script contesta es si eso es UN caso suelto o una práctica
 * instalada. De ahí sale si hace falta un botón de "firmado en papel" o no.
 *
 * ── Cómo leer el resultado ──────────────────────────────────────────────────
 *
 * El número que decide es el de la sección 3: casos ACTIVOS con firma del
 * personal y sin firma del paciente. Esos son los que hoy se quedan colgados
 * para siempre — el mostrador cree que está firmado, el sistema dice que no, y
 * no hay ninguna pantalla donde resolver la diferencia.
 *
 * La sección 4 separa los tres modos de fallar, que no son lo mismo:
 * aceptaciones sin firma es un formulario a medio hacer; firma sin aceptaciones
 * sería un bug nuestro de verdad; y sin nada es un paciente que nunca entró al
 * portal.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const pkgRoot = path.resolve(__dirname, '..', 'packages', 'database');

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = fs.readFileSync(path.join(pkgRoot, '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  if (!m) throw new Error('DATABASE_URL no está ni en el entorno ni en packages/database/.env');
  return m[1].trim().replace(/^"|"$/g, '');
}

/* Las tres aceptaciones + la firma del paciente: la misma condición exacta que
   `consentimientosFirmados()`. Si una cambia, la otra también, o este script
   deja de medir lo que la pantalla muestra. */
const FIRMADO_POR_EL_PACIENTE = `
  ("consentsData"->>'hipaa')::boolean is true
  and ("consentsData"->>'treatment')::boolean is true
  and ("consentsData"->>'financial')::boolean is true
  and nullif("consentsData"->>'financialSignatureSvg','') is not null`;

const CONSULTAS = [
  ['1 · Todos los casos vivos, por estado del intake', `
    select
      case
        when "intakeFormCompletedAt" is not null then 'formulario cerrado (100%)'
        when ${FIRMADO_POR_EL_PACIENTE}            then 'firmado por el paciente'
        else                                            'SIN consentimientos'
      end                                          as estado,
      count(*)                                     as casos,
      round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
    from cases
    where "deletedAt" is null
    group by 1 order by 2 desc`],

  ['2 · De los que NO tienen consentimientos: ¿hay firma del personal?', `
    select
      case when nullif("consentSignaturePng",'') is not null
           then 'SÍ — el PDF muestra una firma que no es del paciente'
           else 'no — el PDF sale sin ninguna firma' end as firma_del_personal,
      count(*) as casos
    from cases
    where "deletedAt" is null
      and "intakeFormCompletedAt" is null
      and not (${FIRMADO_POR_EL_PACIENTE})
    group by 1 order by 2 desc`],

  ['3 · EL NÚMERO QUE DECIDE — casos ACTIVOS con firma del personal y sin la del paciente', `
    select count(*) as casos_colgados
    from cases
    where "deletedAt" is null
      and "status" not in ('CLOSED','SETTLED','ARCHIVED','CANCELLED')
      and "intakeFormCompletedAt" is null
      and nullif("consentSignaturePng",'') is not null
      and not (${FIRMADO_POR_EL_PACIENTE})`],

  ['4 · Los tres modos de fallar (sólo casos vivos sin intake cerrado)', `
    select
      case
        when ("consentsData"->>'hipaa')::boolean is true
         and ("consentsData"->>'treatment')::boolean is true
         and ("consentsData"->>'financial')::boolean is true
         and nullif("consentsData"->>'financialSignatureSvg','') is null
          then 'aceptó las tres y NO firmó — formulario a medio hacer'
        when nullif("consentsData"->>'financialSignatureSvg','') is not null
          then 'firmó y NO aceptó — esto sería un bug nuestro'
        else 'ni aceptaciones ni firma — nunca entró al portal'
      end                    as modo,
      count(*)               as casos
    from cases
    where "deletedAt" is null
      and "intakeFormCompletedAt" is null
      and not (${FIRMADO_POR_EL_PACIENTE})
    group by 1 order by 2 desc`],

  ['5 · ¿Y llegan a la clínica igual? Casos sin consentimientos CON citas', `
    select
      count(distinct c.id)                                     as casos,
      count(distinct c.id) filter (where a."scheduledFor" >= now()) as con_cita_futura
    from cases c
    join appointments a on a."caseId" = c.id and a."status" <> 'CANCELLED'
    where c."deletedAt" is null
      and c."status" not in ('CLOSED','SETTLED','ARCHIVED','CANCELLED')
      and c."intakeFormCompletedAt" is null
      and not (${FIRMADO_POR_EL_PACIENTE.replace(/"consentsData"/g, 'c."consentsData"')})`],

  ['6 · Los 15 más recientes, para mirarlos a mano', `
    select
      "caseCode",
      "status",
      to_char("createdAt", 'YYYY-MM-DD')                      as creado,
      case when nullif("consentSignaturePng",'') is not null then 'firma staff' else '—' end as pdf,
      coalesce(("consentsData"->>'hipaa')::boolean, false)     as hipaa,
      coalesce(("consentsData"->>'treatment')::boolean, false) as tratamiento,
      coalesce(("consentsData"->>'financial')::boolean, false) as financiero
    from cases
    where "deletedAt" is null
      and "status" not in ('CLOSED','SETTLED','ARCHIVED','CANCELLED')
      and "intakeFormCompletedAt" is null
      and nullif("consentSignaturePng",'') is not null
      and not (${FIRMADO_POR_EL_PACIENTE})
    order by "createdAt" desc
    limit 15`],
];

(async () => {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    for (const [titulo, sql] of CONSULTAS) {
      console.log('\n' + '═'.repeat(78));
      console.log(titulo);
      console.log('═'.repeat(78));
      const { rows } = await client.query(sql);
      if (rows.length === 0) console.log('(sin filas)');
      else console.table(rows);
    }
    console.log('\nSólo lectura: no se escribió nada.\n');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('\nFalló:', e.message, '\n');
  process.exit(1);
});
