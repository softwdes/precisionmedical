#!/usr/bin/env node
/**
 * ¿Cuántos casos se pueden distinguir por su fecha de accidente?
 *
 *   node scripts/casos-sin-fecha-de-accidente.cjs
 *
 * Sólo LEE y no escribe nada.
 *
 * Existe por una pregunta concreta: el selector de casos del diálogo de citas
 * ahora muestra la fecha del accidente para que el mostrador sepa cuál elegir
 * cuando un paciente tiene varios (Erick, 17-sep-2026). Eso sirve **si el dato
 * está**. Si resulta que la mitad de los casos no tiene `accidentDate`, la
 * tarjeta va a decir "sin fecha de accidente" y el mostrador queda igual de a
 * ciegas que antes — sólo que ahora la pantalla se lo dice.
 *
 * Lo que importa no es el total: es el número de la ÚLTIMA sección. Un caso sin
 * fecha no molesta a nadie mientras sea el único caso del paciente; el problema
 * aparece cuando hay varios y no se pueden separar. Esa consulta es la que
 * decide si hace falta además una campaña de datos.
 *
 * Ojo con el precedente: `accidentType` está vacío en el 96% de los casos y por
 * eso no se usa para nada autoritativo. Esto es lo mismo, medido antes de
 * confiar.
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

const CONSULTAS = [
  ['Cobertura general', `
    select
      count(*)                                            as casos,
      count("accidentDate")                               as con_fecha,
      count(*) - count("accidentDate")                    as sin_fecha,
      round(100.0 * count("accidentDate") / nullif(count(*),0), 1) as pct_con_fecha
    from cases
    where "deletedAt" is null`],

  ['Por tipo de caso', `
    select
      coalesce("caseType", '(nulo)')                      as tipo,
      count(*)                                            as casos,
      count("accidentDate")                               as con_fecha,
      round(100.0 * count("accidentDate") / nullif(count(*),0), 1) as pct_con_fecha
    from cases
    where "deletedAt" is null
    group by 1 order by 2 desc`],

  ['Pacientes con VARIOS casos — los que sufren el problema', `
    with multi as (
      select "patientId", count(*) casos, count("accidentDate") con_fecha
      from cases where "deletedAt" is null
      group by 1 having count(*) > 1
    )
    select
      count(*)                                  as pacientes_con_varios_casos,
      count(*) filter (where con_fecha = casos) as todos_sus_casos_con_fecha,
      count(*) filter (where con_fecha = 0)     as ninguno_con_fecha,
      count(*) filter (where con_fecha > 0 and con_fecha < casos) as mezclados
    from multi`],

  ['Y de esos, ¿cuántos siguen sin poder separarse?', `
    with multi as (
      select "patientId"
      from cases where "deletedAt" is null
      group by 1 having count(*) > 1
    ),
    fechas as (
      select c."patientId",
             count(*)                                     as casos,
             count(distinct c."accidentDate"::date)        as fechas_distintas,
             count(c."accidentDate")                       as con_fecha
      from cases c join multi m on m."patientId" = c."patientId"
      where c."deletedAt" is null
      group by 1
    )
    select
      count(*)                                            as pacientes_con_varios_casos,
      count(*) filter (where con_fecha = casos and fechas_distintas = casos) as se_distinguen_bien,
      count(*) filter (where con_fecha < casos)           as les_falta_alguna_fecha,
      count(*) filter (where con_fecha = casos and fechas_distintas < casos) as misma_fecha_repetida
    from fechas`],
];

(async () => {
  const client = new Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const [titulo, sql] of CONSULTAS) {
      const { rows } = await client.query(sql);
      console.log(`\n### ${titulo}`);
      console.table(rows);
    }
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
});
