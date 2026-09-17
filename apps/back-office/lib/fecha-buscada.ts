/**
 * Reconocer una FECHA DE NACIMIENTO dentro de lo que alguien tecleó al buscar.
 *
 * Existe porque los cuatro buscadores de paciente —la lista, el autocompletar
 * de citas, el PreCall y la búsqueda global— miraban nombre, teléfono, correo
 * y código, y ninguno miraba `dateOfBirth`. Escribir la fecha de nacimiento no
 * devolvía "pocos resultados": devolvía CERO, que es el peor resultado posible
 * porque se lee como "ese paciente no existe" (Erick, 17-sep-2026).
 *
 * En el mostrador la fecha de nacimiento no es un dato más: es la mitad de
 * cómo se identifica a alguien. El propio schema lo tiene escrito en el
 * comentario de `Patient.email` — *"La identidad es `patientCode` + nombre +
 * fecha de nacimiento"*.
 *
 * ── Tres cosas que no son obvias ──────────────────────────────────────────
 *
 * **1. El día/mes es ambiguo y no hay forma de saber cuál quisieron.** La
 * lista formatea con el idioma de la app (`fechaCalendarioNum`): el mismo
 * paciente se ve `05/12/1980` en inglés y `12/05/1980` en español. El que
 * busca copia lo que TIENE ENFRENTE, que puede ser cualquiera de las dos. Por
 * eso, cuando las dos lecturas son fechas válidas y distintas, se buscan LAS
 * DOS. Como mucho aparece un paciente de más; nunca cero, que es el bug que
 * vinimos a arreglar. Una fecha ISO (`1980-05-12`) no es ambigua y va sola.
 *
 * **2. El rango va por día UTC, sin zona.** `patients.dateOfBirth` es
 * `DateTime` y no `@db.Date`, así que llega como instante; y `fechaCalendario`
 * lo formatea en UTC a propósito (ver la memoria del proyecto: con
 * `America/Denver`, un nacido el 1-ene sale 31-dic). Si el buscador usara la
 * zona de la clínica y la pantalla UTC, habría pacientes que se ven con una
 * fecha y aparecen con otra. Buscando por el día UTC completo, lo que se
 * busca y lo que se ve no se pueden contradecir NUNCA — sea cual sea la hora
 * a la que quedó guardado el valor.
 *
 * **3. Un año suelto NO es una fecha.** `1980` hoy encuentra códigos de
 * paciente con ese número y esa búsqueda funciona. Tomarlo como fecha se la
 * rompería. Sólo se reconoce una fecha COMPLETA: día, mes y año.
 */

/** Ningún paciente nació antes de esto, y nadie nace en el futuro. */
const AÑO_MIN = 1900;

/**
 * Un día del calendario, como rango medio abierto.
 *
 * Medio abierto (`gte` … `lt`) y no `gte`/`lte` porque el valor guardado tiene
 * hora: con `lte` a medianoche se perderían las filas escritas a mediodía UTC,
 * que es justo lo que hace `new-case-dialog` al dar de alta.
 */
export interface RangoDeDia {
  gte: Date;
  lt: Date;
}

export interface TerminoBuscado {
  /**
   * Las lecturas posibles de la fecha que había en el término. Vacío si no
   * había ninguna. Con más de una, son lecturas alternativas de lo MISMO
   * (día/mes al revés) y van en un `OR`.
   */
  fechas: RangoDeDia[];
  /**
   * Lo que quedó del término sacándole la fecha, ya normalizado. Sirve para
   * que `Maria 05/12/1980` busque el nombre "Maria" **y** la fecha, en vez de
   * pedir un apellido que contenga "05/12/1980" — que devolvía cero incluso
   * con el nombre bien escrito.
   */
  resto: string;
}

/** Arma el rango del día si la terna es una fecha real; si no, `null`. */
function diaValido(año: number, mes: number, dia: number): RangoDeDia | null {
  if (año < AÑO_MIN || año > new Date().getUTCFullYear()) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const gte = new Date(Date.UTC(año, mes - 1, dia));
  /**
   * `Date.UTC` no valida: el 31 de febrero se convierte en el 3 de marzo sin
   * chistar. Se comprueba que el día haya sobrevivido al viaje — si no, la
   * fecha no existe y no hay que buscarla.
   */
  if (gte.getUTCMonth() !== mes - 1 || gte.getUTCDate() !== dia) return null;

  return { gte, lt: new Date(Date.UTC(año, mes - 1, dia + 1)) };
}

/** Sin repetidas — las dos lecturas de `05/05/1980` son la misma fecha. */
function sinRepetir(rangos: (RangoDeDia | null)[]): RangoDeDia[] {
  const vistas = new Set<number>();
  const salida: RangoDeDia[] = [];
  for (const r of rangos) {
    if (!r || vistas.has(r.gte.getTime())) continue;
    vistas.add(r.gte.getTime());
    salida.push(r);
  }
  return salida;
}

/**
 * Las formas en que la clínica escribe una fecha.
 *
 * - `05/12/1980`, `5-12-1980`, `5.12.1980` → ambiguas: mes/día o día/mes.
 * - `1980-05-12` → ISO, sin ambigüedad posible.
 * - `05121980` → ocho dígitos pegados, como en el teclado numérico.
 *
 * El año de dos cifras (`05/12/80`) queda AFUERA a propósito: "80" puede ser
 * 1980 o 2080, y adivinar en una fecha de nacimiento es exactamente el tipo de
 * error que nadie revisa.
 */
const SEPARADA = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/;
const ISO      = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const PEGADA   = /^(\d{2})(\d{2})(\d{4})$/;

/** Las lecturas de UN token, o `null` si el token no es una fecha. */
function leerFecha(token: string): RangoDeDia[] | null {
  let m = ISO.exec(token);
  if (m) {
    const r = diaValido(+m[1]!, +m[2]!, +m[3]!);
    return r ? [r] : null;
  }

  m = SEPARADA.exec(token) ?? PEGADA.exec(token);
  if (!m) return null;

  const a = +m[1]!, b = +m[2]!, año = +m[3]!;
  // Las dos lecturas: a/b como mes/día, y como día/mes. Ver el punto 1.
  const fechas = sinRepetir([diaValido(año, a, b), diaValido(año, b, a)]);
  return fechas.length ? fechas : null;
}

/**
 * Parte el término de búsqueda en "la fecha" y "lo demás".
 *
 * Sólo se considera fecha un token ENTERO: nadie escribe la fecha pegada al
 * apellido, y buscar una subcadena numérica adentro de otra cosa daría falsos
 * positivos en códigos y teléfonos.
 */
export function separarFecha(termino: string): TerminoBuscado {
  const tokens = termino.trim().split(/\s+/).filter(Boolean);

  const fechas: RangoDeDia[] = [];
  const resto: string[] = [];

  for (const token of tokens) {
    const leida = fechas.length === 0 ? leerFecha(token) : null;
    if (leida) fechas.push(...leida);
    else resto.push(token);
  }

  return { fechas, resto: resto.join(' ') };
}

/**
 * El `OR` de fechas listo para Prisma, o `[]` si no había fecha.
 *
 * Devuelve cláusulas sueltas (no un `OR` armado) para que cada llamador las
 * meta en el `OR` que ya tiene, sin anidar uno adentro de otro.
 */
export function clausulasDeFecha(fechas: RangoDeDia[]) {
  return fechas.map((f) => ({ dateOfBirth: f }));
}
