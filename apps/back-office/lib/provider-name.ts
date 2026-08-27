/**
 * El nombre de un provider, tal como se muestra y se imprime.
 *
 * Hasta 2026-08-27 esto era `Dr. ${firstName} ${lastName}` escrito a mano en 28
 * lugares (20 con el template literal, 8 mas via la clave `drPrefix`). Ninguno
 * de los providers de la clinica tiene el titulo de doctor — son especialistas —
 * y el prefijo estaba saliendo impreso en la hoja de laboratorio que va a
 * LabCorp y en la nota clinica firmada del expediente: un titulo profesional que
 * no corresponde, en un documento que sale de la clinica y lleva una firma.
 *
 * Por eso el prefijo no existe mas, y por eso el nombre se arma en UN solo lugar.
 * Cuando exista `Provider.credential` (PA-C, NP, DC, MD), se agrega aca y los 28
 * lugares lo heredan sin tocarlos: es la razon de que este archivo exista.
 */

/** Lo minimo que hace falta para armar un nombre. Sirve para un `Provider` de
 *  Prisma, para un `select` parcial y para un objeto armado a mano. */
export type ProviderNombrable = {
  firstName?: string | null;
  lastName?: string | null;
} | null | undefined;

const limpio = (s?: string | null) => (s ?? '').trim();

/**
 * "Devin Clanton". Cadena vacia si no hay con que armarlo — nunca `"undefined
 * undefined"` ni un espacio suelto, que es lo que pasaba con los `?? ''` de los
 * impresos.
 */
export function nombreProvider(p: ProviderNombrable): string {
  if (!p) return '';
  return [limpio(p.firstName), limpio(p.lastName)].filter(Boolean).join(' ');
}

/**
 * "Clanton, Devin" — orden de facturacion y de los ledgers, donde la lista se
 * ordena por apellido. Si falta uno de los dos devuelve el que haya, sin la coma.
 */
export function nombreProviderApellidoPrimero(p: ProviderNombrable): string {
  if (!p) return '';
  const nombre = limpio(p.firstName);
  const apellido = limpio(p.lastName);
  if (!apellido) return nombre;
  if (!nombre) return apellido;
  return `${apellido}, ${nombre}`;
}

/**
 * "D. Clanton" — para las tarjetas de 15 min del calendario, donde el nombre
 * completo no entra. Se desambigua SIEMPRE con la inicial, no solo cuando hay
 * choque de apellido: si el label dependiera de quien mas esta activo, el nombre
 * de un provider cambiaria al dar de alta a otro (Barry y Devin Clanton).
 */
export function nombreProviderCorto(p: ProviderNombrable): string {
  if (!p) return '';
  const apellido = limpio(p.lastName);
  const inicial = limpio(p.firstName).charAt(0);
  if (!apellido) return limpio(p.firstName);
  return inicial ? `${inicial}. ${apellido}` : apellido;
}

/** El nombre, o el fallback que la pantalla quiera mostrar cuando no hay provider. */
export function nombreProviderO(p: ProviderNombrable, fallback: string): string {
  return nombreProvider(p) || fallback;
}

/** El nombre, o `null` — para los campos que viajan por JSON como nullable. */
export function nombreProviderONull(p: ProviderNombrable): string | null {
  return nombreProvider(p) || null;
}
