/**
 * NPI — el identificador del prescriptor que LabCorp exige en la orden.
 *
 * Existe porque el campo estaba mintiendo: la pantalla de Providers dice
 * "Número de Licencia / NPI" y escribe SOLO en `licenseNumber`, así que la
 * columna `npi` nunca se llenó desde la app. Medido el 2026-09-10: de 20
 * providers, el único valor en `npi` es `9906372145`, que **no pasa el dígito
 * verificador y ni siquiera empieza en 1 o 2** — es relleno. Y el único NPI
 * real de la clínica (`1245505858`) está escrito en el campo de licencia, que
 * es otro identificador distinto (la licencia es estatal, el NPI es nacional).
 *
 * Sin NPI válido LabCorp no procesa la orden, así que esto no es una validación
 * cosmética: es la diferencia entre una hoja que el laboratorio acepta y una que
 * devuelve.
 */

/**
 * ¿Es un NPI válido?
 *
 * Diez dígitos con dígito verificador de Luhn calculado sobre el número
 * prefijado con `80840` (el prefijo del NPI en el estándar ISO 7812 que usa
 * CMS). No alcanza con contar diez dígitos: `9906372145` los tiene y es falso.
 */
export function npiValido(valor: string): boolean {
  const s = valor.trim();
  if (!/^\d{10}$/.test(s)) return false;

  const base = `80840${s.slice(0, 9)}`;
  let suma = 0;
  for (let i = 0; i < base.length; i++) {
    let d = Number(base[base.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  const verificador = (10 - (suma % 10)) % 10;
  return verificador === Number(s[9]);
}

/**
 * Los NPI reales empiezan en 1 o 2 (los rangos que CMS asignó a personas y
 * organizaciones). Se avisa aparte del verificador porque un número inventado
 * puede pasar Luhn de casualidad, y este chequeo atrapa los de relleno que
 * arrancan en 9 — como el que hay hoy en la base.
 */
export function npiFormaSospechosa(valor: string): boolean {
  const s = valor.trim();
  return /^\d{10}$/.test(s) && !/^[12]/.test(s);
}
